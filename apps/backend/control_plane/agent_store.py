"""Private, customer/site/user-scoped agent history and revisioned approval drafts."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException

from control_plane.agent_models import (
    AgentConversation,
    AgentConversationDetail,
    AgentMessage,
    AgentPlan,
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS agent_permissions (
 membership_id TEXT PRIMARY KEY REFERENCES memberships(membership_id),
 can_read INTEGER NOT NULL CHECK(can_read IN (0,1)),
 can_approve INTEGER NOT NULL CHECK(can_approve IN (0,1)));
CREATE TABLE IF NOT EXISTS agent_conversations (
 id TEXT PRIMARY KEY, customer TEXT NOT NULL, site TEXT NOT NULL, user TEXT NOT NULL,
 title TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS agent_conversation_scope ON
agent_conversations(customer,site,user,updated);
CREATE TABLE IF NOT EXISTS agent_messages (
 id TEXT PRIMARY KEY, conversation TEXT NOT NULL REFERENCES agent_conversations(id)
ON DELETE CASCADE,
 request_id TEXT NOT NULL, role TEXT NOT NULL, created TEXT NOT NULL, payload TEXT NOT NULL,
 UNIQUE(conversation,request_id,role));
CREATE TABLE IF NOT EXISTS agent_plans (
 id TEXT PRIMARY KEY, conversation TEXT NOT NULL REFERENCES agent_conversations(id)
ON DELETE CASCADE,
 payload TEXT NOT NULL);
"""


def now_iso():
    return datetime.now(UTC).isoformat()


class AgentRepository:
    def __init__(self, store, settings):
        self.store, self.settings = store, settings
        self.db = store.repository.connection
        with store._lock:
            self.db.executescript(SCHEMA)

    def recover_interrupted(self):
        with self.store._lock:
            # A process restart never leaves an orphan response looking live forever.
            rows = self.db.execute(
                "SELECT id,payload FROM agent_messages WHERE role='assistant'"
            ).fetchall()
            for key, raw in rows:
                msg = AgentMessage.model_validate_json(raw)
                if msg.status == "streaming":
                    msg.status = "interrupted"
                    msg.error = "응답이 중단되었습니다. 다시 질문해 주세요."
                    self.db.execute(
                        "UPDATE agent_messages SET payload=? WHERE id=?",
                        (msg.model_dump_json(), key),
                    )

    def permissions(self, identity):
        with self.store._lock:
            row = self.db.execute(
                "SELECT can_read,can_approve FROM agent_permissions WHERE membership_id=?",
                (identity.membership_id,),
            ).fetchone()
        # Existing fully authenticated operators already have Mission creation rights.
        # Explicit per-membership overrides can restrict the agent to read-only or disable it.
        return (True, True) if row is None else (bool(row[0]), bool(row[0] and row[1]))

    def require(self, identity, action="read"):
        read, approve = self.permissions(identity)
        if not (approve if action == "approve" else read):
            raise HTTPException(
                403,
                "AI 작업 승인 권한이 없습니다."
                if action == "approve"
                else "AI 조회 권한이 없습니다.",
            )

    def own(self, key, identity, site):
        self.require(identity)
        with self.store._lock:
            row = self.db.execute(
                "SELECT id,title,created,updated FROM agent_conversations "
                "WHERE id=? AND customer=? AND site=? AND user=?",
                (key, identity.customer_id, site, identity.user_id),
            ).fetchone()
        if not row:
            raise HTTPException(404, "대화를 찾을 수 없습니다.")
        return AgentConversation(
            conversation_id=row[0], title=row[1], created_at=row[2], updated_at=row[3]
        )

    def create(self, identity, site):
        self.require(identity)
        stamp, key = now_iso(), str(uuid4())
        cutoff = (
            datetime.now(UTC) - timedelta(days=self.settings.agent_history_retention_days)
        ).isoformat()
        with self.store.transaction():
            self.db.execute(
                "DELETE FROM agent_conversations WHERE customer=? AND site=? "
                "AND user=? AND updated<?",
                (identity.customer_id, site, identity.user_id, cutoff),
            )
            self.db.execute(
                "INSERT INTO agent_conversations VALUES(?,?,?,?,?,?,?)",
                (key, identity.customer_id, site, identity.user_id, "새 대화", stamp, stamp),
            )
        return self.own(key, identity, site)

    def list(self, identity, site):
        self.require(identity)
        with self.store._lock:
            rows = self.db.execute(
                "SELECT id,title,created,updated FROM agent_conversations "
                "WHERE customer=? AND site=? AND user=? ORDER BY updated DESC LIMIT 30",
                (identity.customer_id, site, identity.user_id),
            ).fetchall()
        return [
            AgentConversation(conversation_id=r[0], title=r[1], created_at=r[2], updated_at=r[3])
            for r in rows
        ]

    def detail(self, key, identity, site):
        conversation = self.own(key, identity, site)
        with self.store._lock:
            messages = self.db.execute(
                "SELECT payload FROM agent_messages WHERE conversation=? ORDER BY rowid", (key,)
            ).fetchall()
            plans = self.db.execute(
                "SELECT payload FROM agent_plans WHERE conversation=? ORDER BY rowid", (key,)
            ).fetchall()
        return AgentConversationDetail(
            **conversation.model_dump(),
            messages=[AgentMessage.model_validate_json(r[0]) for r in messages],
            plans=[self.expire(AgentPlan.model_validate_json(r[0])) for r in plans],
        )

    def expire(self, plan):
        if plan.status == "draft" and datetime.fromisoformat(plan.expires_at) <= datetime.now(UTC):
            plan.status = "expired"
        return plan

    def plan(self, key, identity, site):
        with self.store._lock:
            row = self.db.execute(
                "SELECT conversation,payload FROM agent_plans WHERE id=?", (key,)
            ).fetchone()
        if not row:
            raise HTTPException(404, "계획을 찾을 수 없습니다.")
        self.own(row[0], identity, site)
        return self.expire(AgentPlan.model_validate_json(row[1]))

    def save_plan(self, plan):
        # Caller holds the store transaction when coordinating mission creation.
        self.db.execute(
            "INSERT INTO agent_plans VALUES(?,?,?) ON CONFLICT(id) DO UPDATE "
            "SET payload=excluded.payload",
            (plan.plan_id, plan.conversation_id, plan.model_dump_json()),
        )

    def request_message(self, conversation, request_id):
        with self.store._lock:
            row = self.db.execute(
                "SELECT payload FROM agent_messages WHERE conversation=? AND "
                "request_id=? AND role='assistant'",
                (conversation, request_id),
            ).fetchone()
        return AgentMessage.model_validate_json(row[0]) if row else None

    def begin(self, key, request):
        stamp = now_iso()
        user = AgentMessage(
            message_id=str(uuid4()),
            role="user",
            content=request.content.strip(),
            created_at=stamp,
            context=request.context,
        )
        assistant = AgentMessage(
            message_id=str(uuid4()),
            role="assistant",
            content="",
            created_at=stamp,
            status="streaming",
        )
        with self.store.transaction():
            for message in (user, assistant):
                self.db.execute(
                    "INSERT INTO agent_messages VALUES(?,?,?,?,?,?)",
                    (
                        message.message_id,
                        key,
                        request.client_message_id,
                        message.role,
                        stamp,
                        message.model_dump_json(),
                    ),
                )
            self.db.execute(
                "UPDATE agent_conversations SET title=CASE WHEN title='새 대화' "
                "THEN ? ELSE title END,updated=? WHERE id=?",
                (request.content.strip()[:50], stamp, key),
            )
        return assistant

    def save_message(self, message):
        with self.store.transaction():
            self.db.execute(
                "UPDATE agent_messages SET payload=? WHERE id=?",
                (message.model_dump_json(), message.message_id),
            )
            self.db.execute(
                "UPDATE agent_conversations SET updated=? WHERE id=(SELECT "
                "conversation FROM agent_messages WHERE id=?)",
                (now_iso(), message.message_id),
            )
