"""Scoped, read-only mission aggregates for dashboard chat charts."""

import re
from collections import Counter
from datetime import datetime, timedelta
from statistics import median

from control_plane.agent_tools import KST, half_day_window
from control_plane.agent_view_models import AgentInsight, InsightBucket

OUTCOMES = {
    "SUCCESS": ("완료", "accent"),
    "FAILED": ("실패", "danger"),
    "CANCELLED": ("취소", "muted"),
    "PARTIAL_SUCCESS": ("부분 완료", "info"),
    "HUMAN_REVIEW_REQUIRED": ("사람 확인 필요", "warning"),
    "BLOCKED": ("차단", "warning"),
    "REJECTED": ("거절", "warning"),
    "EXPIRED": ("만료", "muted"),
    "INTERRUPTED": ("중단", "warning"),
}
SOURCES = {
    "real": "실물",
    "sim": "시뮬레이션",
    "mock": "모의",
    "mixed": "단계 혼합",
    "unknown": "출처 미확인",
}


def source_of(mission):
    profile = mission.execution_profile or {}
    if any(not profile.get(key) for key in ("navigation", "perception", "planning", "execution")):
        return "unknown"
    values = set(profile.values())
    return next(iter(values)) if len(values) == 1 else "mixed"


def bucket(label, value, tone="accent", capacity=None):
    return InsightBucket(label=label, value=value, tone=tone, capacity=capacity)


def histogram(bounds, labels, values):
    counts = [0] * len(labels)
    for value in values:
        index = next((i for i, limit in enumerate(bounds) if value <= limit), len(bounds))
        counts[index] += 1
    return [bucket(label, count) for label, count in zip(labels, counts, strict=True)]


def build_insight(ops, kind, question, inventory, limited, base, start, end):
    captured = base["captured_at"]
    start_day, end_day = start.date(), (end - timedelta(days=1)).date()
    scope_label = "시설 전체"
    if limited:
        zones = sorted({r["zone_id"].upper() for r in inventory})
        if len(inventory) == 1:
            scope_label = f"{zones[0]} {inventory[0]['label']}번"
        elif 1 <= len(zones) <= 2:
            scope_label = f"{', '.join(zones)} {len(inventory)}석"
        else:
            scope_label = f"선택 범위 {len(inventory)}석"
    half = ""
    if kind == "queue_age":
        if (
            start_day != captured.date()
            or end_day != captured.date()
            or re.search("오전|오후", question)
        ):
            raise ValueError("대기 시간은 현재 배정 대기열에서 확인할 수 있습니다.")
        start_day = end_day = None
    else:
        start, end, half = half_day_window(question, start, end)
        if half:
            scope_label += f" · {half}"
    ids = {s["seat_id"] for s in inventory}
    with ops.app.store._lock:
        missions = [
            m
            for m in ops.app.store.list_missions()
            if (m.customer_id, m.site_id) == (ops.identity.customer_id, ops.site)
            and (not limited or m.seat_id in ids)
        ]
        if kind == "queue_age":
            sample = [m for m in missions if m.phase == "QUEUED"]
        else:
            field = "created_at" if kind == "request_hours" else "finished_at"
            sample = [
                m
                for m in missions
                if (stamp := getattr(m, field))
                and (field == "created_at" or m.phase == "TERMINAL")
                and start <= datetime.fromisoformat(stamp) < end
            ]
        metric, value, unit, rows, basis, denominator = measure(
            kind, sample, inventory, captured, ops, question, half
        )
        sources = sorted({SOURCES.get(source_of(m), "출처 미확인") for m in sample})
    ops.cite("history", "작업 기록", "/missions", date=(end_day or captured.date()).isoformat())
    card = AgentInsight(
        **base,
        kind=kind,
        start_day=start_day,
        end_day=end_day,
        scope_label=scope_label,
        basis=basis,
        metric=metric,
        value=value,
        unit=unit,
        buckets=rows,
        sample_count=denominator,
        sources=sources,
    )
    summary = (
        f"{metric} {value:g}{unit}입니다. {basis}"
        if denominator
        else f"{basis} · 해당 기록이 없습니다."
    )
    if kind in {"failure_reasons", "request_hours", "repeat_seats"} and any(b.value for b in rows):
        peak = max(b.value for b in rows)
        leaders = [b.label for b in rows if b.value == peak]
        leaders_text = ", ".join(leaders[:3])
        if len(leaders) > 3:
            leaders_text += f" 외 {len(leaders) - 3}개"
        summary += f" 최다는 {leaders_text} ({peak}건)입니다."
    return card, summary


def measure(kind, sample, inventory, captured, ops, question, half):
    n = len(sample)
    if kind == "outcome_mix":
        counts = Counter(m.outcome for m in sample)
        rows = [
            bucket(label, counts[key], tone)
            for key, (label, tone) in OUTCOMES.items()
            if counts[key]
        ]
        unknown = n - sum(r.value for r in rows)
        if unknown:
            rows.append(bucket("결과 미확인", unknown, "muted"))
        return "종료 작업", n, "건", rows, "종료 시각 기준", n
    if kind == "request_hours":
        counts = Counter(
            datetime.fromisoformat(m.created_at).astimezone(KST).hour // 3 for m in sample
        )
        indices = range(4) if half == "오전" else range(4, 8) if half == "오후" else range(8)
        rows = [bucket(f"{i * 3:02d}–{(i + 1) * 3:02d}", counts[i]) for i in indices]
        basis = "한국 시간 · 3시간 단위"
        if half == "오전·오후":
            morning = sum(counts[i] for i in range(4))
            basis += f" · 오전 {morning}건 / 오후 {n - morning}건"
        return "접수 작업", n, "건", rows, basis, n
    if kind == "elapsed_spread":
        minutes = [
            (
                datetime.fromisoformat(m.finished_at) - datetime.fromisoformat(m.created_at)
            ).total_seconds()
            / 60
            for m in sample
        ]
        valid = [x for x in minutes if x >= 0]
        rows = histogram(
            [2, 5, 10], ["2분 이하", "2분 초과~5분", "5분 초과~10분", "10분 초과"], valid
        )
        basis = f"접수부터 종료까지 · 유효 기록 {len(valid)}건"
        if n != len(valid):
            basis += f" · 시각 불일치 {n - len(valid)}건 제외"
        return (
            "중앙 소요 시간",
            round(median(valid), 1) if valid else 0,
            "분",
            rows,
            basis,
            len(valid),
        )
    if kind == "failure_reasons":
        counts = Counter(m.failure_code or "코드 미기록" for m in sample if m.outcome == "FAILED")
        rows = [
            bucket(code, count, "danger")
            for code, count in sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))
        ]
        return "실패 작업", sum(counts.values()), "건", rows, f"종료 작업 {n}건 중 실패 결과", n
    if kind in {"zone_coverage", "repeat_seats"}:
        visits = Counter(m.seat_id for m in sample if m.outcome == "SUCCESS" and m.seat_id)
        if kind == "zone_coverage":
            total = Counter(s["zone_id"] for s in inventory)
            done = Counter(s["zone_id"] for s in inventory if visits[s["seat_id"]])
            rows = [
                bucket(zone.upper(), done[zone], capacity=count) for zone, count in total.items()
            ]
            rows.sort(key=lambda r: (-r.value / r.capacity, r.label))
            return (
                "완료 기록 좌석",
                sum(done.values()),
                "석",
                rows,
                f"등록 {len(inventory)}석 · 좌석당 1회 집계",
                len(inventory),
            )
        rows = [
            bucket(f"{s['zone_id'].upper()} {s['label']}번", visits[s["seat_id"]])
            for s in inventory
            if visits[s["seat_id"]] >= 2
        ]
        rows.sort(key=lambda r: (-r.value, r.label))
        return (
            "반복 정리 좌석",
            len(rows),
            "석",
            rows,
            "등록 좌석 중 성공 기록이 2건 이상인 자리",
            n,
        )
    if kind == "photo_pairs":
        counts = Counter(
            sum(
                bool(ref and ref.startswith("observation://"))
                for ref in (m.before_observation, m.after_observation)
            )
            for m in sample
        )
        rows = [
            bucket("전후 모두", counts[2]),
            bucket("한 장만", counts[1], "warning"),
            bucket("참조 없음", counts[0], "muted"),
        ]
        return (
            "전후 사진 등록",
            counts[2],
            "건",
            rows,
            f"종료 작업 {n}건 · 관리되는 사진 참조 기준",
            n,
        )
    if kind == "run_sources":
        counts = Counter(source_of(m) for m in sample)
        rows = [
            bucket(label, counts[key], tone)
            for (key, label), tone in zip(
                SOURCES.items(), ("accent", "info", "muted", "warning", "muted"), strict=True
            )
            if counts[key]
        ]
        return (
            "전체 실물 단계",
            counts["real"],
            "건",
            rows,
            f"종료 작업 {n}건 · 네 단계의 실행 출처",
            n,
        )
    if kind == "review_progress":
        required = [m for m in sample if m.needs_human_review]
        done = 0
        for start in range(0, len(required), 300):
            ids = [m.mission_id for m in required[start : start + 300]]
            placeholders = ",".join("?" for _ in ids)
            done += ops.app.accounts.db.execute(
                f"SELECT count(*) FROM mission_reviews WHERE mission_id IN ({placeholders})", ids
            ).fetchone()[0]
        rows = [bucket("검토 완료", done), bucket("검토 대기", len(required) - done, "warning")]
        return "검토 완료", done, "건", rows, f"검토 대상 {len(required)}건", len(required)
    if kind != "queue_age":
        raise ValueError("지원하지 않는 분석입니다.")
    waits = [(captured - datetime.fromisoformat(m.created_at)).total_seconds() / 60 for m in sample]
    valid = [v for v in waits if v >= 0]
    threshold = re.search(r"(\d+)\s*분\s*(?:넘|초과)", question)
    limit = int(threshold[1]) if threshold else 30
    rows = histogram([10, 30], ["10분 이하", "10분 초과~30분", "30분 초과"], valid)
    return (
        f"{limit}분 초과",
        sum(v > limit for v in valid),
        "건",
        rows,
        f"조회 시점의 배정 대기 {len(valid)}건",
        len(valid),
    )
