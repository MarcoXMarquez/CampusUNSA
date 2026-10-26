"""
SQLAlchemy 2.0 models for Google Classroom courses and coursework assignments.
Implements deduplication via composite unique constraints:
- (user_id, classroom_course_id)
- (user_id, classroom_assignment_id)
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class ClassroomCourse(Base):
    """
    Represents an active course enrolled by a student in Google Classroom.
    """
    __tablename__ = "classroom_courses"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    classroom_course_id: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    section: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    alternate_link: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="courses")
    assignments: Mapped[List["ClassroomAssignment"]] = relationship(
        "ClassroomAssignment",
        back_populates="course",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "classroom_course_id",
            name="uq_user_classroom_course",
        ),
        Index("idx_classroom_courses_user_id", "user_id"),
    )

    def __repr__(self) -> str:
        return f"<ClassroomCourse(id={self.id}, name='{self.name}', google_id='{self.classroom_course_id}')>"


class ClassroomAssignment(Base):
    """
    Represents coursework / assignments pulled from Google Classroom (or other LMS origins).
    Deduplicated via unique constraint on (user_id, classroom_assignment_id).
    """
    __tablename__ = "classroom_assignments"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("classroom_courses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    classroom_assignment_id: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )
    description: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    due_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )
    max_points: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
    )
    state: Mapped[str] = mapped_column(
        String(50),
        default="PUBLISHED",
        nullable=False,
    )
    alternate_link: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
    )
    origin: Mapped[str] = mapped_column(
        String(50),
        default="classroom",
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="assignments")
    course: Mapped["ClassroomCourse"] = relationship("ClassroomCourse", back_populates="assignments")

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "classroom_assignment_id",
            name="uq_user_classroom_assignment",
        ),
        Index("idx_classroom_assignments_user_assignment", "user_id", "classroom_assignment_id"),
        Index("idx_classroom_assignments_due_date", "due_date"),
    )

    def __repr__(self) -> str:
        return f"<ClassroomAssignment(id={self.id}, title='{self.title}', due_date='{self.due_date}')>"
