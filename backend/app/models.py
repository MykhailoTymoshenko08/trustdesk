"""sqlalchemy models"""
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    email: Mapped[str] = mapped_column(String)
    timezone: Mapped[str] = mapped_column(String, default="Europe/Kyiv")
    free_lessons: Mapped[int] = mapped_column(Integer, default=0)


class Tutor(Base):
    __tablename__ = "tutors"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)


class Lesson(Base):
    __tablename__ = "lessons"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    tutor_id: Mapped[str] = mapped_column(ForeignKey("tutors.id"))
    requested_at: Mapped[datetime] = mapped_column(DateTime)  # time the parent asked for
    stored_at: Mapped[datetime] = mapped_column(DateTime)  # time actually stored
    status: Mapped[str] = mapped_column(String, default="scheduled")  # scheduled | completed | missed
    price_cents: Mapped[int] = mapped_column(Integer, default=4500)


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    amount_cents: Mapped[int] = mapped_column(Integer)
    at: Mapped[datetime] = mapped_column(DateTime)
    kind: Mapped[str] = mapped_column(String, default="package")


class Subscription(Base):
    __tablename__ = "subscriptions"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    plan: Mapped[str] = mapped_column(String)
    price_cents: Mapped[int] = mapped_column(Integer)
    renews_at: Mapped[datetime] = mapped_column(DateTime)


class Event(Base):
    __tablename__ = "events"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    at: Mapped[datetime] = mapped_column(DateTime, index=True)
    feature: Mapped[str] = mapped_column(String, index=True)
    event: Mapped[str] = mapped_column(String)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    error_code: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    release: Mapped[str | None] = mapped_column(String, nullable=True)


class Ticket(Base):
    __tablename__ = "tickets"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    channel: Mapped[str] = mapped_column(String, default="chat")
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String, default="new")
    incident_id: Mapped[str | None] = mapped_column(ForeignKey("incidents.id"), nullable=True)
    triage: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    embedding: Mapped[list | None] = mapped_column(JSON, nullable=True)


class Incident(Base):
    __tablename__ = "incidents"
    __table_args__ = (UniqueConstraint("feature", "error_code", name="uq_incident_signal"),)
    id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(String)
    feature: Mapped[str] = mapped_column(String)
    error_code: Mapped[str | None] = mapped_column(String, nullable=True)
    release: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="open")
    first_seen: Mapped[datetime] = mapped_column(DateTime)
    last_seen: Mapped[datetime] = mapped_column(DateTime)


class Audit(Base):
    __tablename__ = "audit"
    __table_args__ = (UniqueConstraint("idempotency_key", name="uq_audit_idem"),)
    id: Mapped[str] = mapped_column(String, primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime)
    actor: Mapped[str] = mapped_column(String)
    action: Mapped[str] = mapped_column(String)
    user_id: Mapped[str] = mapped_column(String)
    incident_id: Mapped[str | None] = mapped_column(String, nullable=True)
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[str] = mapped_column(String)
    idempotency_key: Mapped[str | None] = mapped_column(String, nullable=True)
    reversible: Mapped[bool] = mapped_column(Boolean, default=False)
    rolled_back: Mapped[bool] = mapped_column(Boolean, default=False)


class Plan(Base):
    __tablename__ = "plans"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    proposals: Mapped[list] = mapped_column(JSON)


class Message(Base):
    """simulated outbound message to a family"""
    __tablename__ = "messages"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    incident_id: Mapped[str | None] = mapped_column(String, nullable=True)
    text: Mapped[str] = mapped_column(Text)
    at: Mapped[datetime] = mapped_column(DateTime)


class QaReply(Base):
    """a human agent's reply to a ticket, with its cached QA verdict"""
    __tablename__ = "qa_replies"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id"), index=True)
    agent: Mapped[str] = mapped_column(String)
    reply: Mapped[str] = mapped_column(Text)
    verdict: Mapped[dict | None] = mapped_column(JSON, nullable=True)
