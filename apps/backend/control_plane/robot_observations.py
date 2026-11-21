"""Persist read-only observations and bounded operational intervals, independently of missions."""

from __future__ import annotations

import json
from collections import defaultdict
from contextlib import contextmanager
from datetime import UTC, datetime
from math import ceil, hypot
from time import time
from uuid import uuid4

from control_plane.telemetry_models import (
    ActivityDuration,
    BatteryPoint,
    ObservedSample,
    RobotAnalytics,
    RobotObservation,
    RobotOperationalEvent,
    RobotTelemetrySnapshot,
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS robot_observations (
 customer TEXT, site TEXT, robot TEXT, kind TEXT, received REAL, expires REAL,
 session TEXT, payload TEXT, PRIMARY KEY(customer,site,robot,kind));
CREATE TABLE IF NOT EXISTS robot_observation_offsets (
 customer TEXT, site TEXT, robot TEXT, boot TEXT, sequence INTEGER, received REAL,
 PRIMARY KEY(customer,site,robot,boot));
CREATE TABLE IF NOT EXISTS robot_battery_history (
 id INTEGER PRIMARY KEY, customer TEXT, site TEXT, robot TEXT, occurred REAL,
 percentage REAL, charging TEXT, provenance TEXT);
CREATE INDEX IF NOT EXISTS battery_scope_time
 ON robot_battery_history(customer,site,robot,occurred);
CREATE TABLE IF NOT EXISTS robot_activity_history (
 id INTEGER PRIMARY KEY, customer TEXT, site TEXT, robot TEXT, started REAL,
 sampled REAL, expires REAL, state TEXT, provenance TEXT);
CREATE INDEX IF NOT EXISTS activity_scope_time
 ON robot_activity_history(customer,site,robot,started);
CREATE TABLE IF NOT EXISTS robot_operational_events (
 id INTEGER PRIMARY KEY, customer TEXT, site TEXT, robot TEXT, event_id TEXT,
 occurred REAL, kind TEXT, severity TEXT, title TEXT, detail TEXT,
 provenance TEXT, mission_id TEXT,
 UNIQUE(customer,site,robot,event_id));
CREATE INDEX IF NOT EXISTS operational_scope_time
 ON robot_operational_events(customer,site,robot,occurred);
"""


def iso(value: float) -> str:
    return datetime.fromtimestamp(value, UTC).isoformat()


class RobotObservations:
    def __init__(self, store, settings, robot_scope, clock=time):
        self.store, self.settings, self.robot_scope, self.clock = (
            store,
            settings,
            robot_scope,
            clock,
        )
        self.db = store.repository.connection
        with store._lock:
            self.db.executescript(SCHEMA)
        self.connections: dict[str, tuple[str, tuple[str, str]]] = {}
        self.last_prune = 0.0
        self.unsubscribe = store.subscribe(self.on_operation)

    @contextmanager
    def transaction(self):
        # The shared store lock serializes this independent commit with mission transactions.
        with self.store._lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                yield
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                raise

    def claim(self, robot: str, scope: tuple[str, str]) -> str | None:
        with self.store._lock:
            if robot in self.connections:
                return None
            session = str(uuid4())
            self.connections[robot] = (session, scope)
            return session

    def release(self, robot: str, session: str):
        with self.store._lock:
            if self.connections.get(robot, (None,))[0] == session:
                _, scope = self.connections.pop(robot)
                with self.transaction():
                    self.db.execute(
                        (
                            "UPDATE robot_activity_history SET expires=MIN(expires,?) WHERE "
                            "customer=? AND site=? AND robot=? AND expires>?"
                        ),
                        (self.clock(), *scope, robot, self.clock()),
                    )

    def ttl(self, kind: str) -> float:
        if kind == "battery":
            return self.settings.telemetry_battery_stale_seconds
        if kind.startswith("supervisor") or kind == "safety":
            return self.settings.telemetry_supervisor_stale_seconds
        return self.settings.telemetry_stale_seconds

    def snapshot(self, robot: str, scope: tuple[str, str]) -> RobotTelemetrySnapshot:
        now = self.clock()
        with self.store._lock:
            owner = self.connections.get(robot)
            connected = bool(owner and owner[1] == scope)
            rows = self.db.execute(
                "SELECT kind,received,expires,session,payload FROM robot_observations "
                "WHERE customer=? AND site=? AND robot=?",
                (*scope, robot),
            ).fetchall()
        return RobotTelemetrySnapshot(
            robot_id=robot,
            connected=connected,
            poll_interval_ms=self.settings.telemetry_poll_interval_ms,
            samples={
                kind: ObservedSample(
                    received_at=iso(received),
                    expires_at=iso(expires),
                    stale=not connected or session != owner[0] or now >= expires,
                    observation=RobotObservation.model_validate_json(payload),
                )
                for kind, received, expires, session, payload in rows
            },
        )

    def receive(
        self, robot: str, scope: tuple[str, str], session: str, frame: RobotObservation
    ) -> bool:
        now, kind = self.clock(), frame.sample.kind
        ttl = self.ttl(kind)
        if frame.source_age_seconds >= ttl:
            return False
        with self.transaction():
            if self.connections.get(robot) != (session, scope):
                raise ValueError("observation producer no longer owns the connection")
            offset = self.db.execute(
                (
                    "SELECT sequence FROM robot_observation_offsets WHERE customer=? AND "
                    "site=? AND robot=? AND boot=?"
                ),
                (*scope, robot, frame.boot_id),
            ).fetchone()
            if offset and frame.sequence <= offset[0]:
                return False
            previous = self.db.execute(
                (
                    "SELECT payload,received FROM robot_observations WHERE customer=? AND site=? "
                    "AND robot=? AND kind=?"
                ),
                (*scope, robot, kind),
            ).fetchone()
            old = json.loads(previous[0]) if previous else None
            if old and old["boot_id"] == frame.boot_id:
                if frame.source_stamp < old["source_stamp"]:
                    return False
                if frame.source_stamp == old["source_stamp"]:
                    if kind not in ("joints", "joint_targets"):
                        return False
                    prior = old["sample"]
                    ages = prior.get("ages_seconds") or [0.0] * len(prior["names"])
                    previous_joints = dict(
                        zip(prior["names"], zip(prior["positions"], ages, strict=True), strict=True)
                    )
                    new_ages = frame.sample.ages_seconds or [0.0] * len(frame.sample.names)
                    changed = False
                    for name, position, age in zip(
                        frame.sample.names, frame.sample.positions, new_ages, strict=True
                    ):
                        old_joint = previous_joints.get(name)
                        if old_joint is None or age < old_joint[1]:
                            changed = True
                        elif age != old_joint[1] or position != old_joint[0]:
                            return False
                    if not changed:
                        return False
                    # A partial message cannot renew the lifetime of the same source instant.
                    age = max(
                        frame.source_age_seconds, old["source_age_seconds"] + now - previous[1]
                    )
                    if age >= ttl:
                        return False
                    frame = frame.model_copy(update={"source_age_seconds": age})
            self.db.execute(
                "INSERT INTO robot_observation_offsets VALUES(?,?,?,?,?,?) "
                "ON CONFLICT(customer,site,robot,boot) DO UPDATE SET "
                "sequence=excluded.sequence,received=excluded.received",
                (*scope, robot, frame.boot_id, frame.sequence, now),
            )
            if kind != "supervisor_event":
                self.db.execute(
                    "INSERT INTO robot_observations VALUES(?,?,?,?,?,?,?,?) "
                    "ON CONFLICT(customer,site,robot,kind) DO UPDATE SET "
                    "received=excluded.received,"
                    "expires=excluded.expires,session=excluded.session,payload=excluded.payload",
                    (
                        *scope,
                        robot,
                        kind,
                        now,
                        now + ttl - frame.source_age_seconds,
                        session,
                        frame.model_dump_json(),
                    ),
                )
            if kind == "battery":
                changed = not old or old["sample"]["charging"] != frame.sample.charging
                last = self.db.execute(
                    (
                        "SELECT occurred FROM robot_battery_history WHERE customer=? AND site=?"
                        " AND robot=? ORDER BY occurred DESC,id DESC LIMIT 1"
                    ),
                    (*scope, robot),
                ).fetchone()
                if (
                    changed
                    or not last
                    or now - last[0] >= self.settings.telemetry_battery_sample_seconds
                ):
                    self.db.execute(
                        (
                            "INSERT INTO "
                            "robot_battery_history(customer,site,robot,occurred,percentage,charging,provenance)"
                            " VALUES(?,?,?,?,?,?,?)"
                        ),
                        (
                            *scope,
                            robot,
                            now,
                            frame.sample.percentage,
                            frame.sample.charging,
                            frame.provenance,
                        ),
                    )
                if changed and frame.sample.charging in ("CHARGING", "FULL"):
                    self._event(
                        scope,
                        robot,
                        f"{frame.boot_id}:{frame.sequence}",
                        now,
                        "CHARGE_STARTED" if frame.sample.charging == "CHARGING" else "CHARGE_FULL",
                        "info",
                        "충전 시작" if frame.sample.charging == "CHARGING" else "충전 완료",
                        "",
                        frame.provenance,
                    )
                elif changed and old and old["sample"]["charging"] == "CHARGING":
                    self._event(
                        scope,
                        robot,
                        f"{frame.boot_id}:{frame.sequence}",
                        now,
                        "CHARGE_ENDED",
                        "info",
                        "충전 종료",
                        "",
                        frame.provenance,
                    )
            elif kind == "supervisor_event":
                sample = frame.sample
                titles = {
                    "FAULT_RAISED": "장애 발생",
                    "FAULT_CLEARED": "장애 해제",
                    "RECOVERY_REQUESTED": "자동 복구 요청",
                    "RECOVERY_RUNNING": "자동 복구 시작",
                    "RECOVERY_CANCELED": "자동 복구 취소",
                    "RECOVERY_UNSUPPORTED": "자동 복구 불가",
                    "STATE_RESTORE_FAILED": "운영 상태 복원 실패",
                    "STATE_PERSIST_FAILED": "운영 상태 저장 실패",
                    "RECOVERY_SUCCEEDED": "자동 복구 완료",
                    "RECOVERY_FAILED": "자동 복구 실패",
                    "MISSION_STOPPED": "안전 정지",
                    "STATE_CHANGED": "운용 상태 변경",
                    "FAULT_RESET_ACCEPTED": "장애 리셋 승인",
                }
                self._event(
                    scope,
                    robot,
                    f"supervisor:{sample.epoch}:{sample.event_sequence}",
                    now,
                    sample.event_kind,
                    sample.severity,
                    titles.get(sample.event_kind, "시스템 이벤트"),
                    sample.detail or sample.code,
                    frame.provenance,
                )
            self._record_activity(scope, robot, now)
        return True

    def _event(
        self,
        scope,
        robot,
        event_id,
        now,
        kind,
        severity,
        title,
        detail,
        provenance,
        mission_id=None,
    ):
        self.db.execute(
            (
                "INSERT OR IGNORE INTO "
                "robot_operational_events(customer,site,robot,event_id,occurred,kind,severity,title,detail,provenance,mission_id)"
                " VALUES(?,?,?,?,?,?,?,?,?,?,?)"
            ),
            (*scope, robot, event_id, now, kind, severity, title, detail, provenance, mission_id),
        )

    def activity(self, scope, robot, now):
        samples = self.snapshot(robot, scope).samples
        fresh = {k: s for k, s in samples.items() if not s.stale}

        def observed(state, sample):
            return (
                state,
                datetime.fromisoformat(sample.expires_at).timestamp(),
                sample.observation.provenance,
            )

        supervisor = fresh.get("supervisor_state")
        if supervisor and supervisor.observation.sample.operating_state == "FAULT_LOCKED":
            return observed("FAULT", supervisor)
        safety = fresh.get("safety")
        if safety and (
            safety.observation.sample.estop_engaged
            or not safety.observation.sample.protection_ready
        ):
            return observed("STOPPED", safety)
        battery = fresh.get("battery")
        if battery and battery.observation.sample.charging == "CHARGING":
            return observed("CHARGING", battery)
        runtime = self.store.robot
        if (
            runtime.robot_id == robot
            and runtime.control_mode == "gateway"
            and runtime.last_seen_at
            and runtime.state != "OFFLINE"
        ):
            expires = (
                datetime.fromisoformat(runtime.last_seen_at).timestamp()
                + self.settings.gateway_heartbeat_timeout_seconds
            )
            if expires > now:
                mission = (
                    self.store.get_mission(runtime.active_mission_id)
                    if runtime.active_mission_id
                    else None
                )
                state = (
                    "FAULT"
                    if runtime.state == "ERROR"
                    else "WORKING"
                    if mission and mission.phase == "WORKING"
                    else "MOVING"
                    if mission and mission.phase in ("NAVIGATING", "RETURNING")
                    else "IDLE"
                    if runtime.state == "IDLE"
                    else "UNKNOWN"
                )
                profile = runtime.execution_profile or {}
                provenance = (
                    "mock"
                    if "mock" in profile.values()
                    else "sim"
                    if "sim" in profile.values()
                    else "real"
                    if profile
                    else "unknown"
                )
                if state != "IDLE":
                    return state, expires, provenance
                idle = (state, expires, provenance)
            else:
                idle = None
        else:
            idle = None
        base = fresh.get("base")
        if (
            base
            and max(
                hypot(*base.observation.sample.linear_velocity),
                hypot(*base.observation.sample.angular_velocity),
            )
            > self.settings.telemetry_moving_speed_threshold
        ):
            return observed("MOVING", base)
        return idle or ("UNKNOWN", now, "unknown")

    def _record_activity(self, scope, robot, now):
        state, expires, provenance = self.activity(scope, robot, now)
        if state == "UNKNOWN":
            self.db.execute(
                (
                    "UPDATE robot_activity_history SET expires=MIN(expires,?) WHERE "
                    "customer=? AND site=? AND robot=? AND expires>?"
                ),
                (now, *scope, robot, now),
            )
            return
        last = self.db.execute(
            (
                "SELECT id,started,sampled,expires,state,provenance FROM "
                "robot_activity_history WHERE customer=? AND site=? AND robot=? ORDER "
                "BY started DESC,id DESC LIMIT 1"
            ),
            (*scope, robot),
        ).fetchone()
        if last and last[4:] == (state, provenance) and last[1] <= now <= last[3]:
            if now - last[2] >= self.settings.telemetry_activity_sample_seconds:
                self.db.execute(
                    "UPDATE robot_activity_history SET sampled=?,expires=? WHERE id=?",
                    (now, expires, last[0]),
                )
        else:
            # Close the prior interval at the observed transition, never bridge a data gap.
            if last:
                self.db.execute(
                    "UPDATE robot_activity_history SET expires=MIN(expires,?) WHERE id=?",
                    (now, last[0]),
                )
            self.db.execute(
                (
                    "INSERT INTO "
                    "robot_activity_history(customer,site,robot,started,sampled,expires,state,provenance)"
                    " VALUES(?,?,?,?,?,?,?,?)"
                ),
                (*scope, robot, now, now, expires, state, provenance),
            )

    def manual_block(self, robot, scope) -> str | None:
        samples = self.snapshot(robot, scope).samples
        for kind in ("supervisor_state", "safety"):
            sample = samples.get(kind)
            if sample and sample.stale:
                return "안전 상태 갱신 중단 · 연결 확인 필요"
        state, safety = samples.get("supervisor_state"), samples.get("safety")
        if state and state.observation.sample.operating_state == "FAULT_LOCKED":
            return "Supervisor 장애 잠금 · 현장 확인 필요"
        if safety and (
            not safety.observation.sample.protection_ready
            or safety.observation.sample.estop_engaged
            or not safety.observation.sample.physical_release_confirmed
        ):
            return "안전 보호 또는 물리 비상정지 상태 확인 필요"
        return None

    def on_operation(self, event):
        if not str(event["event_type"]).startswith("mission."):
            return
        payload = event["payload"]
        if payload.get("phase") != "TERMINAL" or event["event_type"] == "mission.reviewed":
            return
        scope = self.robot_scope(event["robot_id"])
        if not scope:
            return
        now = self.clock()
        with self.transaction():
            outcome = payload.get("outcome")
            profile = payload.get("execution_profile") or {}
            provenance = (
                "mock"
                if "mock" in profile.values()
                else "sim"
                if "sim" in profile.values()
                else "real"
                if profile
                else "unknown"
            )
            self._event(
                scope,
                event["robot_id"],
                f"mission:{event['mission_id']}:terminal",
                now,
                "MISSION_COMPLETED" if outcome == "SUCCESS" else "MISSION_ENDED",
                "info" if outcome == "SUCCESS" else "warning",
                "작업 완료" if outcome == "SUCCESS" else "작업 종료",
                str(outcome or ""),
                provenance,
                event["mission_id"],
            )

    def tick(self):
        now = self.clock()
        robot = self.store.robot.robot_id
        scope = self.robot_scope(robot)
        with self.transaction():
            if scope:
                self._record_activity(scope, robot, now)
            if now - self.last_prune >= self.settings.telemetry_prune_interval_seconds:
                before = now - self.settings.telemetry_retention_days * 86400
                for table, field in (
                    ("robot_battery_history", "occurred"),
                    ("robot_activity_history", "expires"),
                    ("robot_operational_events", "occurred"),
                    ("robot_observation_offsets", "received"),
                ):
                    self.db.execute(f"DELETE FROM {table} WHERE {field}<?", (before,))
                self.last_prune = now

    def analytics(
        self, robot, scope, start: datetime, end: datetime, before: str | None = None
    ) -> RobotAnalytics:
        result, _ = self.analytics_with_battery(robot, scope, start, end, before)
        return result

    def analytics_with_battery(self, robot, scope, start: datetime, end: datetime, before=None):
        """Return the dashboard chart and statistics from the same unbucketed observations."""
        if (
            start.tzinfo is None
            or end.tzinfo is None
            or end <= start
            or (end - start).total_seconds() > 31 * 86400
        ):
            raise ValueError("기간은 시간대를 포함한 1~31일 범위여야 합니다.")
        left, right = start.timestamp(), max(start.timestamp(), min(end.timestamp(), self.clock()))
        window = right - left
        with self.store._lock:
            battery_rows = self.db.execute(
                (
                    "SELECT occurred,percentage,charging,provenance FROM "
                    "robot_battery_history WHERE customer=? AND site=? AND robot=? AND "
                    "occurred>=? AND occurred<? ORDER BY occurred,id"
                ),
                (*scope, robot, left, right),
            ).fetchall()
            activities = self.db.execute(
                (
                    "SELECT started,expires,state,provenance FROM robot_activity_history "
                    "WHERE customer=? AND site=? AND robot=? AND expires>? AND started<? "
                    "ORDER BY started,id"
                ),
                (*scope, robot, left, right),
            ).fetchall()
            cursor = (right, 2**63 - 1)
            if before:
                raw, identity = before.split("|", 1)
                cursor = (float(raw), int(identity))
                if not left <= cursor[0] <= right or not 0 <= cursor[1] <= 2**63 - 1:
                    raise ValueError("invalid event cursor")
            events = self.db.execute(
                (
                    "SELECT "
                    "id,event_id,occurred,kind,severity,title,detail,provenance,mission_id "
                    "FROM robot_operational_events WHERE customer=? AND site=? AND robot=? "
                    "AND occurred>=? AND occurred<? AND (occurred<? OR (occurred=? AND "
                    "id<?)) ORDER BY occurred DESC,id DESC LIMIT 101"
                ),
                (*scope, robot, left, right, cursor[0], cursor[0], cursor[1]),
            ).fetchall()
        totals = defaultdict(float)
        provenance = {event[7] for event in events}
        for i, (started, expires, state, origin) in enumerate(activities):
            stop = min(right, expires, activities[i + 1][0] if i + 1 < len(activities) else right)
            seconds = max(0, stop - max(left, started))
            totals[state] += seconds
            if seconds:
                provenance.add(origin)
        observed = sum(totals.values())
        if activities:
            totals["UNKNOWN"] = max(0, window - observed)
        bucket_seconds = max(60, ceil(window / 480))
        buckets = defaultdict(list)
        for occurred, percentage, charging, origin in battery_rows:
            buckets[int((occurred - left) // bucket_seconds)].append((percentage, charging))
            provenance.add(origin)
        points = []
        for index in range(ceil(window / bucket_seconds)) if battery_rows else []:
            values = buckets[index]
            percentages = [v for v, _ in values if v is not None]
            charges = [v for v, state in values if v is not None and state == "CHARGING"]
            points.append(
                BatteryPoint(
                    time=iso(left + index * bucket_seconds),
                    samples=len(values),
                    percentage=sum(percentages) / len(percentages) if percentages else None,
                    charging_percentage=sum(charges) / len(charges) if charges else None,
                )
            )
        last = events[99] if len(events) > 100 else None
        report = RobotAnalytics(
            robot_id=robot,
            start=iso(left),
            end=iso(right),
            window_seconds=window,
            observed_seconds=observed,
            activities=[ActivityDuration(state=k, seconds=v) for k, v in totals.items()],
            battery=points,
            provenance=sorted(provenance),
            retention_days=self.settings.telemetry_retention_days,
            events=[
                RobotOperationalEvent(
                    event_id=r[1],
                    occurred_at=iso(r[2]),
                    kind=r[3],
                    severity=r[4],
                    title=r[5],
                    detail=r[6],
                    provenance=r[7],
                    mission_id=r[8],
                )
                for r in events[:100]
            ],
            next_event_cursor=f"{last[2]}|{last[0]}" if last else None,
        )
        samples = [row for row in battery_rows if row[1] is not None]
        percentages = [row[1] for row in samples]
        return report, {
            "recorded_points": len(samples),
            "first": percentages[0] if percentages else None,
            "charging_observed": any(row[2] == "CHARGING" for row in battery_rows),
            "min": min(percentages, default=None),
            "max": max(percentages, default=None),
            "latest": percentages[-1] if samples else None,
            "provenance": sorted({row[3] for row in samples}),
        }
