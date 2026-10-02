"""Company provisioning and revocable customer-scoped sessions."""

from __future__ import annotations

import hashlib
import secrets
import time
from dataclasses import dataclass
from uuid import uuid4

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError

ACCOUNT_SCHEMA = """
CREATE TABLE IF NOT EXISTS customers (
 customer_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, disabled_at REAL);
CREATE TABLE IF NOT EXISTS users (
 user_id TEXT PRIMARY KEY, login_id TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
 password_hash TEXT NOT NULL, must_change_password INTEGER NOT NULL,
 temporary_password_expires_at REAL, disabled_at REAL);
CREATE TABLE IF NOT EXISTS memberships (
 membership_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers,
 user_id TEXT NOT NULL REFERENCES users, revoked_at REAL,
 UNIQUE(customer_id,membership_id));
CREATE UNIQUE INDEX IF NOT EXISTS one_active_membership
 ON memberships(user_id) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS sessions (
 session_id TEXT PRIMARY KEY, membership_id TEXT NOT NULL REFERENCES memberships,
 token_hash TEXT NOT NULL UNIQUE, csrf_token TEXT NOT NULL, scope TEXT NOT NULL,
 expires_at REAL NOT NULL, last_activity_at REAL NOT NULL, revoked_at REAL);
CREATE TABLE IF NOT EXISTS sites (
 site_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers,
 display_name TEXT NOT NULL, map_ref TEXT NOT NULL, disabled_at REAL,
 UNIQUE(customer_id,site_id));
CREATE TABLE IF NOT EXISTS robots (
 robot_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers,
 current_site_id TEXT, token_hash TEXT NOT NULL, disabled_at REAL,
 UNIQUE(customer_id,robot_id),
 FOREIGN KEY(customer_id,current_site_id) REFERENCES sites(customer_id,site_id));
"""
HASHER = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)
DUMMY_HASH = HASHER.hash(secrets.token_urlsafe(32))


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


class AuthError(ValueError):
    def __init__(self, detail: str = "로그인이 필요합니다.", status: int = 401):
        super().__init__(detail)
        self.status = status


@dataclass(frozen=True)
class Identity:
    user_id: str
    login_id: str
    display_name: str
    customer_id: str
    customer_name: str
    membership_id: str
    session_id: str
    scope: str
    csrf_token: str
    expires_at: float


class Accounts:
    def __init__(self, store, settings):
        self.store = store
        self.db = store.repository.connection
        self.settings = settings
        self.failures: dict[str, list[float]] = {}

    def _session(self, membership_id: str, must_change: bool, temporary_expiry=None):
        now = time.time()
        token = secrets.token_urlsafe(32)
        expiry = now + (
            self.settings.password_change_session_seconds
            if must_change
            else self.settings.session_absolute_seconds
        )
        if must_change:
            expiry = min(expiry, temporary_expiry)
        self.db.execute(
            "INSERT INTO sessions VALUES(?,?,?,?,?,?,?,NULL)",
            (
                str(uuid4()),
                membership_id,
                token_hash(token),
                secrets.token_urlsafe(32),
                "password_change" if must_change else "full",
                expiry,
                now,
            ),
        )
        return token

    def authenticate(self, token: str | None, full: bool = True) -> Identity:
        if not token:
            raise AuthError()
        with self.store._lock:
            row = self.db.execute(
                "SELECT u.user_id,u.login_id,u.display_name,c.customer_id,c.display_name,"
                "m.membership_id,s.session_id,s.scope,s.csrf_token,s.expires_at,"
                "s.last_activity_at,u.must_change_password,u.temporary_password_expires_at "
                "FROM sessions s JOIN memberships m USING(membership_id) "
                "JOIN users u USING(user_id) JOIN customers c USING(customer_id) "
                "WHERE s.token_hash=? AND s.revoked_at IS NULL AND m.revoked_at IS NULL "
                "AND u.disabled_at IS NULL AND c.disabled_at IS NULL",
                (token_hash(token),),
            ).fetchone()
            now = time.time()
            if (
                not row
                or row[9] <= now
                or row[10] + self.settings.session_idle_seconds <= now
                or (row[11] and (row[12] is None or row[12] <= now))
                or (row[7] == "full" and row[11])
            ):
                raise AuthError()
            if full and row[7] != "full":
                raise AuthError("먼저 비밀번호를 변경해 주세요.", 403)
            return Identity(*row[:10])

    def login(self, login_id: str, password: str, ip: str):
        login_id = login_id.strip().lower()
        now = time.monotonic()
        keys = (f"id:{login_id}", f"ip:{ip}")
        with self.store._lock:
            # Bound memory even when callers rotate login IDs/IPs.
            self.failures = {
                k: [t for t in values if t > now - self.settings.auth_failure_window]
                for k, values in self.failures.items()
                if values and values[-1] > now - self.settings.auth_failure_window
            }
            for key, limit in zip(
                keys, (self.settings.auth_identity_limit, self.settings.auth_ip_limit), strict=True
            ):
                if len(self.failures.get(key, [])) >= limit:
                    raise AuthError("잠시 후 다시 시도해 주세요.", 429)
            row = self.db.execute(
                "SELECT u.password_hash,u.must_change_password,u.temporary_password_expires_at,"
                "m.membership_id FROM users u JOIN memberships m USING(user_id) "
                "JOIN customers c USING(customer_id) WHERE u.login_id=? "
                "AND u.disabled_at IS NULL AND m.revoked_at IS NULL AND c.disabled_at IS NULL",
                (login_id,),
            ).fetchone()
        try:
            HASHER.verify(row[0] if row else DUMMY_HASH, password)
            valid = bool(row and (not row[1] or row[2] > time.time()))
        except VerificationError:
            valid = False
        with self.store.transaction():
            if not valid:
                for key in keys:
                    self.failures.setdefault(key, []).append(now)
                raise AuthError("아이디 또는 비밀번호를 확인해 주세요.")
            # Provision/reset can happen while the expensive hash is checked.
            current = self.db.execute(
                "SELECT u.password_hash FROM users u JOIN memberships m USING(user_id) "
                "JOIN customers c USING(customer_id) WHERE m.membership_id=? "
                "AND m.revoked_at IS NULL AND u.disabled_at IS NULL AND c.disabled_at IS NULL",
                (row[3],),
            ).fetchone()
            if not current or current[0] != row[0]:
                raise AuthError()
            return self._session(row[3], bool(row[1]), row[2])

    def change_password(self, token: str, password: str, current_password: str | None = None):
        if not 15 <= len(password) <= 128:
            raise AuthError("비밀번호는 15~128자로 입력해 주세요.", 422)
        identity = self.authenticate(token, full=False)
        with self.store._lock:
            old_hash = self.db.execute(
                "SELECT password_hash FROM users WHERE user_id=?", (identity.user_id,)
            ).fetchone()[0]
        if identity.scope == "full":
            try:
                HASHER.verify(old_hash, current_password or "")
            except VerificationError:
                raise AuthError("현재 비밀번호를 확인해 주세요.", 422) from None
        try:
            if HASHER.verify(old_hash, password):
                raise AuthError("기존 비밀번호와 다른 비밀번호를 입력해 주세요.", 422)
        except VerificationError:
            pass
        encoded = HASHER.hash(password)
        with self.store.transaction():
            identity = self.authenticate(token, full=False)
            if (
                self.db.execute(
                    "SELECT password_hash FROM users WHERE user_id=?", (identity.user_id,)
                ).fetchone()[0]
                != old_hash
            ):
                raise AuthError()
            self.db.execute(
                "UPDATE users SET password_hash=?,must_change_password=0,"
                "temporary_password_expires_at=NULL WHERE user_id=?",
                (encoded, identity.user_id),
            )
            self.revoke_user_sessions(identity.user_id)
            return self._session(identity.membership_id, False)

    def revoke_user_sessions(self, user_id: str):
        self.db.execute(
            "UPDATE sessions SET revoked_at=? WHERE membership_id IN "
            "(SELECT membership_id FROM memberships WHERE user_id=?)",
            (time.time(), user_id),
        )

    def create_customer(self, name: str) -> str:
        identifier = str(uuid4())
        with self.store.transaction():
            self.db.execute("INSERT INTO customers VALUES(?,?,NULL)", (identifier, name))
        return identifier

    def create_site(
        self, customer_id: str, name: str, map_ref="facility-18f", site_id: str | None = None
    ) -> str:
        identifier = site_id or str(uuid4())
        with self.store.transaction():
            self.db.execute(
                "INSERT INTO sites VALUES(?,?,?,?,NULL)", (identifier, customer_id, name, map_ref)
            )
        return identifier

    def provision(self, customer_id: str, login_id: str, name: str):
        login_id = login_id.strip().lower()
        if not login_id or len(login_id) > 64:
            raise ValueError("login_id must contain 1~64 characters")
        password = secrets.token_urlsafe(24)
        encoded = HASHER.hash(password)
        user_id = str(uuid4())
        with self.store.transaction():
            self.db.execute(
                "INSERT INTO users VALUES(?,?,?,?,1,?,NULL)",
                (
                    user_id,
                    login_id,
                    name,
                    encoded,
                    time.time() + self.settings.temporary_password_seconds,
                ),
            )
            self.db.execute(
                "INSERT INTO memberships VALUES(?,?,?,NULL)", (str(uuid4()), customer_id, user_id)
            )
        return user_id, password

    def reset(self, user_id: str, reactivate: bool = False):
        password = secrets.token_urlsafe(24)
        encoded = HASHER.hash(password)
        with self.store.transaction():
            if not self.db.execute("SELECT 1 FROM users WHERE user_id=?", (user_id,)).fetchone():
                raise ValueError("unknown user")
            self.db.execute(
                "UPDATE users SET password_hash=?,must_change_password=1,"
                "temporary_password_expires_at=? WHERE user_id=?",
                (encoded, time.time() + self.settings.temporary_password_seconds, user_id),
            )
            if reactivate:
                self.db.execute("UPDATE users SET disabled_at=NULL WHERE user_id=?", (user_id,))
            self.revoke_user_sessions(user_id)
        return password

    def disable(self, user_id: str):
        with self.store.transaction():
            if (
                self.db.execute(
                    "UPDATE users SET disabled_at=? WHERE user_id=?", (time.time(), user_id)
                ).rowcount
                != 1
            ):
                raise ValueError("unknown user")
            self.revoke_user_sessions(user_id)

    def register_robot(self, customer_id: str, site_id: str, robot_id="cleany-01"):
        token = secrets.token_urlsafe(32)
        with self.store.transaction():
            if (
                self.store.robot.active_mission_id
                or self.db.execute("SELECT 1 FROM missions WHERE active=1").fetchone()
            ):
                raise ValueError("robot has an unresolved mission")
            existing = self.db.execute(
                "SELECT customer_id FROM robots WHERE robot_id=?", (robot_id,)
            ).fetchone()
            if existing and existing[0] != customer_id:
                raise ValueError("cross-customer robot transfer is not supported")
            self.db.execute(
                "INSERT INTO robots VALUES(?,?,?,?,NULL) ON CONFLICT(robot_id) "
                "DO UPDATE SET current_site_id=excluded.current_site_id,"
                "token_hash=excluded.token_hash",
                (robot_id, customer_id, site_id, token_hash(token)),
            )
        return token

    def robot_scope(self, robot_id: str, token: str | None = None):
        with self.store._lock:
            row = self.db.execute(
                "SELECT r.customer_id,r.current_site_id,r.token_hash FROM robots r "
                "JOIN customers c USING(customer_id) JOIN sites s ON "
                "s.site_id=r.current_site_id AND s.customer_id=r.customer_id "
                "WHERE r.robot_id=? AND r.disabled_at IS NULL AND c.disabled_at IS NULL "
                "AND s.disabled_at IS NULL",
                (robot_id,),
            ).fetchone()
            if not row or (
                token is not None and not secrets.compare_digest(row[2], token_hash(token))
            ):
                return None
            return row[:2]
