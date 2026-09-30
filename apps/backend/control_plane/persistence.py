"""Single-process SQLite repository. Caller serializes access with the store lock."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any


class SQLiteRepository:
    def __init__(self, path: str) -> None:
        if path != ":memory:":
            path = str(Path(path).expanduser().resolve())
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.connection.execute("PRAGMA foreign_keys=ON")
        self.connection.execute("PRAGMA journal_mode=WAL")
        version = self.connection.execute("PRAGMA user_version").fetchone()[0]
        if version not in (0, 1):
            raise ValueError(f"unsupported database version: {version}")
        self.connection.executescript("""
            CREATE TABLE IF NOT EXISTS missions (
                mission_id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE,
                active INTEGER NOT NULL, payload TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS single_active_mission
                ON missions(active) WHERE active = 1;
            CREATE TRIGGER IF NOT EXISTS immutable_terminal
                BEFORE UPDATE OF payload ON missions
                WHEN json_extract(OLD.payload,'$.phase') = 'TERMINAL'
                     AND NEW.payload != OLD.payload
                BEGIN SELECT RAISE(ABORT, 'terminal mission cannot change'); END;
            CREATE TABLE IF NOT EXISTS robot_snapshot (
                id INTEGER PRIMARY KEY, payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS event_inbox (
                event_id TEXT PRIMARY KEY, payload TEXT NOT NULL, disposition TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS command_outbox (
                event_id TEXT PRIMARY KEY, mission_id TEXT NOT NULL,
                payload TEXT NOT NULL, acknowledged INTEGER NOT NULL DEFAULT 0,
                attempts INTEGER NOT NULL DEFAULT 0, next_attempt REAL NOT NULL DEFAULT 0
            );
            PRAGMA user_version=1;
        """)

    def load(self) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
        missions = [
            json.loads(row[0])
            for row in self.connection.execute("SELECT payload FROM missions ORDER BY rowid")
        ]
        row = self.connection.execute("SELECT payload FROM robot_snapshot WHERE id=1").fetchone()
        return missions, json.loads(row[0]) if row else None

    def save(self, missions: list[dict[str, Any]], robot: dict[str, Any]) -> None:
        # Remove the old active index entry before installing the new reservation.
        self.connection.execute("UPDATE missions SET active=0 WHERE active=1")
        for mission in missions:
            active = mission["phase"] not in ("QUEUED", "TERMINAL")
            self.connection.execute(
                "INSERT INTO missions VALUES(?,?,?,?) ON CONFLICT(mission_id) DO UPDATE SET "
                "active=excluded.active, payload=excluded.payload",
                (
                    mission["mission_id"],
                    mission["idempotency_key"],
                    int(active),
                    json.dumps(mission),
                ),
            )
        self.connection.execute(
            "INSERT INTO robot_snapshot VALUES(1,?) ON CONFLICT(id) DO UPDATE SET "
            "payload=excluded.payload",
            (json.dumps(robot),),
        )

    def seen(self, event_id: str) -> bool:
        return (
            self.connection.execute(
                "SELECT 1 FROM event_inbox WHERE event_id=?",
                (event_id,),
            ).fetchone()
            is not None
        )

    def record(self, event: dict[str, Any], disposition: str) -> None:
        self.connection.execute(
            "INSERT INTO event_inbox VALUES(?,?,?)",
            (event["event_id"], json.dumps(event), disposition),
        )

    def enqueue(self, event: dict[str, Any]) -> None:
        self.connection.execute(
            "INSERT INTO command_outbox(event_id,mission_id,payload) VALUES(?,?,?)",
            (event["event_id"], event["mission_id"], json.dumps(event)),
        )

    def acknowledge(self, event_id: str) -> None:
        self.connection.execute(
            "UPDATE command_outbox SET acknowledged=1 WHERE event_id=?",
            (event_id,),
        )

    def retire(self, mission_id: str, event_type: str | None = None) -> None:
        sql = "UPDATE command_outbox SET acknowledged=1 WHERE mission_id=?"
        values: list[Any] = [mission_id]
        if event_type:
            sql += " AND json_extract(payload,'$.event_type')=?"
            values.append(event_type)
        self.connection.execute(sql, values)

    def pending(self, now: float) -> list[tuple[dict[str, Any], int]]:
        return [
            (json.loads(row[0]), row[1])
            for row in self.connection.execute(
                "SELECT payload,attempts FROM command_outbox WHERE acknowledged=0 "
                "AND next_attempt<=? ORDER BY rowid",
                (now,),
            )
        ]

    def sent(self, event_id: str, next_attempt: float) -> None:
        self.connection.execute(
            "UPDATE command_outbox SET attempts=attempts+1,next_attempt=? WHERE event_id=?",
            (next_attempt, event_id),
        )

    def close(self) -> None:
        self.connection.close()
