"""
SQLAlchemy 2.0 models for unified curriculum courses, shared external sources,
per-student enrollments, and coursework assignments.
"""

import json
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class CourseCatalog(Base):
    """
    Canonical UNSA curriculum course master catalog (2017 and 2025 plans).
    Shared across all students and academic periods.
    """

    __tablename__ = "course_catalog"

    code: Mapped[str] = mapped_column(String(20), primary_key=True, index=True)
    curriculum_year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    official_name: Mapped[str] = mapped_column(String(255), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(10), nullable=False)
    study_year: Mapped[int] = mapped_column(Integer, nullable=False)
    semester: Mapped[int] = mapped_column(Integer, nullable=False)
    department: Mapped[str] = mapped_column(String(120), nullable=False)
    credits: Mapped[int] = mapped_column(Integer, nullable=False)
    prerequisites_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    min_credits_required: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    theory_hours: Mapped[float] = mapped_column(Float, default=0.0, server_default="0", nullable=False)
    practice_hours: Mapped[float] = mapped_column(Float, default=0.0, server_default="0", nullable=False)
    lab_hours: Mapped[float] = mapped_column(Float, default=0.0, server_default="0", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    external_sources: Mapped[List["CourseExternalSource"]] = relationship(
        "CourseExternalSource",
        back_populates="catalog_course",
    )
    enrollments: Mapped[List["UserCourseEnrollment"]] = relationship(
        "UserCourseEnrollment",
        back_populates="catalog_course",
    )
    schedule_blocks: Mapped[List["CourseScheduleBlock"]] = relationship(
        "CourseScheduleBlock",
        back_populates="catalog_course",
        cascade="all, delete-orphan",
    )

    @property
    def prerequisites(self) -> List[str]:
        if not self.prerequisites_json:
            return []
        try:
            parsed = json.loads(self.prerequisites_json)
            return [str(item) for item in parsed] if isinstance(parsed, list) else []
        except ValueError:
            return []


class CourseExternalSource(Base):
    """
    Shared external virtual classroom or DUTIC course space for an academic term.
    Multiple external sources (e.g., DUTIC + Classroom Theory + Classroom Lab) can
    resolve to the same canonical course_catalog entry.
    """

    __tablename__ = "course_external_sources"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    term: Mapped[str] = mapped_column(
        String(20),
        default="2026B",
        server_default="2026B",
        nullable=False,
        index=True,
    )
    origin: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
    )
    external_course_id: Mapped[str] = mapped_column(
        String(120),
        nullable=False,
        index=True,
    )
    raw_name: Mapped[str] = mapped_column(String(255), nullable=False)
    raw_section: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    alternate_link: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    course_code: Mapped[Optional[str]] = mapped_column(
        ForeignKey("course_catalog.code", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    component_type: Mapped[str] = mapped_column(
        String(20),
        default="UNICO",
        server_default="UNICO",
        nullable=False,
    )
    default_group_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    mapping_status: Mapped[str] = mapped_column(
        String(30),
        default="PENDING_LINK",
        server_default="PENDING_LINK",
        nullable=False,
        index=True,
    )
    mapping_source: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    linked_by_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
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

    catalog_course: Mapped[Optional["CourseCatalog"]] = relationship(
        "CourseCatalog",
        back_populates="external_sources",
    )
    user_links: Mapped[List["UserExternalCourse"]] = relationship(
        "UserExternalCourse",
        back_populates="source",
        cascade="all, delete-orphan",
    )
    assignments: Mapped[List["ClassroomAssignment"]] = relationship(
        "ClassroomAssignment",
        back_populates="source",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint(
            "term",
            "origin",
            "external_course_id",
            name="uq_external_source_term_origin_id",
        ),
    )


class UserCourseEnrollment(Base):
    """
    Unified per-student enrollment for a canonical curriculum course and term.
    Stores student-specific theory and lab groups (A-F).
    """

    __tablename__ = "user_course_enrollments"

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
    course_code: Mapped[str] = mapped_column(
        ForeignKey("course_catalog.code", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    term: Mapped[str] = mapped_column(
        String(20),
        default="2026B",
        server_default="2026B",
        nullable=False,
        index=True,
    )
    theory_group: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    lab_group: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
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

    user: Mapped["User"] = relationship("User", back_populates="enrollments")
    catalog_course: Mapped["CourseCatalog"] = relationship(
        "CourseCatalog",
        back_populates="enrollments",
    )
    user_sources: Mapped[List["UserExternalCourse"]] = relationship(
        "UserExternalCourse",
        back_populates="enrollment",
    )
    assignments: Mapped[List["ClassroomAssignment"]] = relationship(
        "ClassroomAssignment",
        back_populates="enrollment",
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "course_code",
            "term",
            name="uq_user_course_enrollment",
        ),
        Index("idx_user_course_enrollments_user_id", "user_id"),
    )


class UserExternalCourse(Base):
    """
    Records a student's membership in a shared external source so courses with zero
    assignments or pending catalog links are never lost.
    """

    __tablename__ = "user_external_courses"

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
    source_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("course_external_sources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    enrollment_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("user_course_enrollments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    detected_group: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
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

    user: Mapped["User"] = relationship("User", back_populates="external_courses")
    source: Mapped["CourseExternalSource"] = relationship(
        "CourseExternalSource",
        back_populates="user_links",
    )
    enrollment: Mapped[Optional["UserCourseEnrollment"]] = relationship(
        "UserCourseEnrollment",
        back_populates="user_sources",
    )

    __table_args__ = (
        UniqueConstraint("user_id", "source_id", name="uq_user_external_course"),
        Index("idx_user_external_courses_user_id", "user_id"),
    )


class ClassroomAssignment(Base):
    """
    Coursework assignments pulled from Google Classroom or DUTIC Moodle.
    Linked to the originating CourseExternalSource and, once mapped, to the canonical
    CourseCatalog code and the student's unified UserCourseEnrollment.
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
    source_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("course_external_sources.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    course_code: Mapped[Optional[str]] = mapped_column(
        ForeignKey("course_catalog.code", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    enrollment_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("user_course_enrollments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    classroom_assignment_id: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )
    reported_course: Mapped[str | None] = mapped_column(String(120), nullable=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    due_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )
    max_points: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    state: Mapped[str] = mapped_column(String(50), default="PUBLISHED", nullable=False)
    is_completed: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default="false",
        nullable=False,
    )
    priority: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    component_type_override: Mapped[Optional[str]] = mapped_column(
        "component_type",
        String(20),
        nullable=True,
    )
    alternate_link: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    origin: Mapped[str] = mapped_column(String(50), default="classroom", nullable=False)
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

    user: Mapped["User"] = relationship("User", back_populates="assignments")
    source: Mapped[Optional["CourseExternalSource"]] = relationship(
        "CourseExternalSource",
        back_populates="assignments",
    )
    enrollment: Mapped[Optional["UserCourseEnrollment"]] = relationship(
        "UserCourseEnrollment",
        back_populates="assignments",
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "classroom_assignment_id",
            name="uq_user_classroom_assignment",
        ),
        Index("idx_classroom_assignments_user_assignment", "user_id", "classroom_assignment_id"),
        Index("idx_classroom_assignments_due_date", "due_date"),
    )

    @property
    def course_id(self) -> Optional[uuid.UUID]:
        """Return unified enrollment ID when linked, or fallback to external source ID."""
        return self.enrollment_id or self.source_id

    @property
    def component_type(self) -> Optional[str]:
        """Return explicit assignment component type override or external source component type."""
        if self.component_type_override:
            return self.component_type_override
        return self.source.component_type if self.source is not None else None

    @property
    def group_code(self) -> Optional[str]:
        """Resolve the student's section group for this assignment's component."""
        component = self.component_type
        if self.enrollment is not None:
            if component == "LABORATORIO" and self.enrollment.lab_group:
                return self.enrollment.lab_group
            if component in ("TEORIA", "UNICO") and self.enrollment.theory_group:
                return self.enrollment.theory_group
            if self.enrollment.theory_group or self.enrollment.lab_group:
                return self.enrollment.theory_group or self.enrollment.lab_group
        if self.source is not None:
            return self.source.default_group_code
        return None

    def __repr__(self) -> str:
        return f"<ClassroomAssignment(id={self.id}, title='{self.title}', due_date='{self.due_date}')>"


class CourseScheduleBlock(Base):
    """
    Shared weekly class schedule slot (Teoria or Laboratorio) keyed by canonical
    course_code, term, component_type, and group_code (A-F).
    """

    __tablename__ = "course_schedule_blocks"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    course_code: Mapped[str] = mapped_column(
        ForeignKey("course_catalog.code", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    term: Mapped[str] = mapped_column(
        String(20),
        default="2026B",
        server_default="2026B",
        nullable=False,
        index=True,
    )
    component_type: Mapped[str] = mapped_column(String(20), nullable=False)
    group_code: Mapped[str] = mapped_column(String(5), nullable=False)
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[str] = mapped_column(String(5), nullable=False)
    end_time: Mapped[str] = mapped_column(String(5), nullable=False)
    room: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    pavilion: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    updated_by_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
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

    catalog_course: Mapped["CourseCatalog"] = relationship(
        "CourseCatalog",
        back_populates="schedule_blocks",
    )

    __table_args__ = (
        UniqueConstraint(
            "course_code",
            "term",
            "component_type",
            "group_code",
            "day_of_week",
            "start_time",
            name="uq_course_schedule_block_slot",
        ),
        Index(
            "idx_course_schedule_lookup",
            "course_code",
            "term",
            "component_type",
            "group_code",
        ),
    )
