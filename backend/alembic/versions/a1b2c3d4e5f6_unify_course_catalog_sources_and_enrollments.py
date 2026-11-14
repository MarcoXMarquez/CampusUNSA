"""Unify courses via curriculum catalog, shared external sources, and per-student enrollments.

Revision ID: a1b2c3d4e5f6
Revises: f9a0b1c2d3e4
"""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.core.curriculum_catalog_data import CURRICULUM_CATALOG_ENTRIES

revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "f9a0b1c2d3e4"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    # Clear pre-unification synced records per user decision (clean slate for new model).
    op.execute("DELETE FROM classroom_assignments")

    op.drop_constraint(
        "classroom_assignments_course_id_fkey",
        "classroom_assignments",
        type_="foreignkey",
    )
    op.drop_index(op.f("ix_classroom_assignments_course_id"), table_name="classroom_assignments")
    op.drop_column("classroom_assignments", "course_id")

    op.drop_index(op.f("ix_classroom_courses_origin"), table_name="classroom_courses")
    op.drop_index("idx_classroom_courses_user_id", table_name="classroom_courses")
    op.drop_index(op.f("ix_classroom_courses_classroom_course_id"), table_name="classroom_courses")
    op.drop_index(op.f("ix_classroom_courses_id"), table_name="classroom_courses")
    op.drop_index(op.f("ix_classroom_courses_user_id"), table_name="classroom_courses")
    op.drop_table("classroom_courses")

    op.add_column("users", sa.Column("inferred_curriculum_year", sa.Integer(), nullable=True))

    op.create_table(
        "course_catalog",
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("curriculum_year", sa.Integer(), nullable=False),
        sa.Column("official_name", sa.String(length=255), nullable=False),
        sa.Column("normalized_name", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=10), nullable=False),
        sa.Column("study_year", sa.Integer(), nullable=False),
        sa.Column("semester", sa.Integer(), nullable=False),
        sa.Column("department", sa.String(length=120), nullable=False),
        sa.Column("credits", sa.Integer(), nullable=False),
        sa.Column("prerequisites_json", sa.Text(), nullable=True),
        sa.Column("min_credits_required", sa.Integer(), server_default="0", nullable=False),
        sa.Column("theory_hours", sa.Float(), server_default="0", nullable=False),
        sa.Column("practice_hours", sa.Float(), server_default="0", nullable=False),
        sa.Column("lab_hours", sa.Float(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("code"),
    )
    op.create_index(op.f("ix_course_catalog_code"), "course_catalog", ["code"], unique=False)
    op.create_index(op.f("ix_course_catalog_curriculum_year"), "course_catalog", ["curriculum_year"], unique=False)
    op.create_index(op.f("ix_course_catalog_normalized_name"), "course_catalog", ["normalized_name"], unique=False)

    catalog_table = sa.table(
        "course_catalog",
        sa.column("code", sa.String),
        sa.column("curriculum_year", sa.Integer),
        sa.column("official_name", sa.String),
        sa.column("normalized_name", sa.String),
        sa.column("category", sa.String),
        sa.column("study_year", sa.Integer),
        sa.column("semester", sa.Integer),
        sa.column("department", sa.String),
        sa.column("credits", sa.Integer),
        sa.column("prerequisites_json", sa.Text),
        sa.column("min_credits_required", sa.Integer),
        sa.column("theory_hours", sa.Float),
        sa.column("practice_hours", sa.Float),
        sa.column("lab_hours", sa.Float),
    )
    op.bulk_insert(
        catalog_table,
        [
            {
                "code": entry["code"],
                "curriculum_year": entry["curriculum_year"],
                "official_name": entry["official_name"],
                "normalized_name": entry["normalized_name"],
                "category": entry["category"],
                "study_year": entry["study_year"],
                "semester": entry["semester"],
                "department": entry["department"],
                "credits": entry["credits"],
                "prerequisites_json": json.dumps(entry["prerequisites"]),
                "min_credits_required": entry["min_credits_required"],
                "theory_hours": entry["theory_hours"],
                "practice_hours": entry["practice_hours"],
                "lab_hours": entry["lab_hours"],
            }
            for entry in CURRICULUM_CATALOG_ENTRIES
        ],
    )

    op.create_table(
        "course_external_sources",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("term", sa.String(length=20), server_default="2026B", nullable=False),
        sa.Column("origin", sa.String(length=50), nullable=False),
        sa.Column("external_course_id", sa.String(length=120), nullable=False),
        sa.Column("raw_name", sa.String(length=255), nullable=False),
        sa.Column("raw_section", sa.String(length=255), nullable=True),
        sa.Column("alternate_link", sa.String(length=500), nullable=True),
        sa.Column("course_code", sa.String(length=20), nullable=True),
        sa.Column("component_type", sa.String(length=20), server_default="UNICO", nullable=False),
        sa.Column("default_group_code", sa.String(length=10), nullable=True),
        sa.Column("mapping_status", sa.String(length=30), server_default="PENDING_LINK", nullable=False),
        sa.Column("mapping_source", sa.String(length=40), nullable=True),
        sa.Column("linked_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["course_code"], ["course_catalog.code"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["linked_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("term", "origin", "external_course_id", name="uq_external_source_term_origin_id"),
    )
    op.create_index(op.f("ix_course_external_sources_course_code"), "course_external_sources", ["course_code"], unique=False)
    op.create_index(op.f("ix_course_external_sources_external_course_id"), "course_external_sources", ["external_course_id"], unique=False)
    op.create_index(op.f("ix_course_external_sources_id"), "course_external_sources", ["id"], unique=False)
    op.create_index(op.f("ix_course_external_sources_mapping_status"), "course_external_sources", ["mapping_status"], unique=False)
    op.create_index(op.f("ix_course_external_sources_origin"), "course_external_sources", ["origin"], unique=False)
    op.create_index(op.f("ix_course_external_sources_term"), "course_external_sources", ["term"], unique=False)

    op.create_table(
        "user_course_enrollments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("course_code", sa.String(length=20), nullable=False),
        sa.Column("term", sa.String(length=20), server_default="2026B", nullable=False),
        sa.Column("theory_group", sa.String(length=5), nullable=True),
        sa.Column("lab_group", sa.String(length=5), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["course_code"], ["course_catalog.code"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "course_code", "term", name="uq_user_course_enrollment"),
    )
    op.create_index("idx_user_course_enrollments_user_id", "user_course_enrollments", ["user_id"], unique=False)
    op.create_index(op.f("ix_user_course_enrollments_course_code"), "user_course_enrollments", ["course_code"], unique=False)
    op.create_index(op.f("ix_user_course_enrollments_id"), "user_course_enrollments", ["id"], unique=False)
    op.create_index(op.f("ix_user_course_enrollments_term"), "user_course_enrollments", ["term"], unique=False)
    op.create_index(op.f("ix_user_course_enrollments_user_id"), "user_course_enrollments", ["user_id"], unique=False)

    op.create_table(
        "user_external_courses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("enrollment_id", sa.Uuid(), nullable=True),
        sa.Column("detected_group", sa.String(length=5), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["enrollment_id"], ["user_course_enrollments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["source_id"], ["course_external_sources.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "source_id", name="uq_user_external_course"),
    )
    op.create_index("idx_user_external_courses_user_id", "user_external_courses", ["user_id"], unique=False)
    op.create_index(op.f("ix_user_external_courses_enrollment_id"), "user_external_courses", ["enrollment_id"], unique=False)
    op.create_index(op.f("ix_user_external_courses_id"), "user_external_courses", ["id"], unique=False)
    op.create_index(op.f("ix_user_external_courses_source_id"), "user_external_courses", ["source_id"], unique=False)
    op.create_index(op.f("ix_user_external_courses_user_id"), "user_external_courses", ["user_id"], unique=False)

    op.add_column("classroom_assignments", sa.Column("source_id", sa.Uuid(), nullable=False))
    op.add_column("classroom_assignments", sa.Column("course_code", sa.String(length=20), nullable=True))
    op.add_column("classroom_assignments", sa.Column("enrollment_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_classroom_assignments_course_code"), "classroom_assignments", ["course_code"], unique=False)
    op.create_index(op.f("ix_classroom_assignments_enrollment_id"), "classroom_assignments", ["enrollment_id"], unique=False)
    op.create_index(op.f("ix_classroom_assignments_source_id"), "classroom_assignments", ["source_id"], unique=False)
    op.create_foreign_key(
        "classroom_assignments_source_id_fkey",
        "classroom_assignments",
        "course_external_sources",
        ["source_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "classroom_assignments_course_code_fkey",
        "classroom_assignments",
        "course_catalog",
        ["course_code"],
        ["code"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "classroom_assignments_enrollment_id_fkey",
        "classroom_assignments",
        "user_course_enrollments",
        ["enrollment_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.execute("DELETE FROM classroom_assignments")
    op.drop_constraint("classroom_assignments_enrollment_id_fkey", "classroom_assignments", type_="foreignkey")
    op.drop_constraint("classroom_assignments_course_code_fkey", "classroom_assignments", type_="foreignkey")
    op.drop_constraint("classroom_assignments_source_id_fkey", "classroom_assignments", type_="foreignkey")
    op.drop_index(op.f("ix_classroom_assignments_source_id"), table_name="classroom_assignments")
    op.drop_index(op.f("ix_classroom_assignments_enrollment_id"), table_name="classroom_assignments")
    op.drop_index(op.f("ix_classroom_assignments_course_code"), table_name="classroom_assignments")
    op.drop_column("classroom_assignments", "enrollment_id")
    op.drop_column("classroom_assignments", "course_code")
    op.drop_column("classroom_assignments", "source_id")

    op.drop_index(op.f("ix_user_external_courses_user_id"), table_name="user_external_courses")
    op.drop_index(op.f("ix_user_external_courses_source_id"), table_name="user_external_courses")
    op.drop_index(op.f("ix_user_external_courses_id"), table_name="user_external_courses")
    op.drop_index(op.f("ix_user_external_courses_enrollment_id"), table_name="user_external_courses")
    op.drop_index("idx_user_external_courses_user_id", table_name="user_external_courses")
    op.drop_table("user_external_courses")

    op.drop_index(op.f("ix_user_course_enrollments_user_id"), table_name="user_course_enrollments")
    op.drop_index(op.f("ix_user_course_enrollments_term"), table_name="user_course_enrollments")
    op.drop_index(op.f("ix_user_course_enrollments_id"), table_name="user_course_enrollments")
    op.drop_index(op.f("ix_user_course_enrollments_course_code"), table_name="user_course_enrollments")
    op.drop_index("idx_user_course_enrollments_user_id", table_name="user_course_enrollments")
    op.drop_table("user_course_enrollments")

    op.drop_index(op.f("ix_course_external_sources_term"), table_name="course_external_sources")
    op.drop_index(op.f("ix_course_external_sources_origin"), table_name="course_external_sources")
    op.drop_index(op.f("ix_course_external_sources_mapping_status"), table_name="course_external_sources")
    op.drop_index(op.f("ix_course_external_sources_id"), table_name="course_external_sources")
    op.drop_index(op.f("ix_course_external_sources_external_course_id"), table_name="course_external_sources")
    op.drop_index(op.f("ix_course_external_sources_course_code"), table_name="course_external_sources")
    op.drop_table("course_external_sources")

    op.drop_index(op.f("ix_course_catalog_normalized_name"), table_name="course_catalog")
    op.drop_index(op.f("ix_course_catalog_curriculum_year"), table_name="course_catalog")
    op.drop_index(op.f("ix_course_catalog_code"), table_name="course_catalog")
    op.drop_table("course_catalog")

    op.drop_column("users", "inferred_curriculum_year")

    op.create_table(
        "classroom_courses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("classroom_course_id", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("section", sa.String(length=255), nullable=True),
        sa.Column("alternate_link", sa.String(length=500), nullable=True),
        sa.Column("origin", sa.String(length=50), server_default="classroom", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "classroom_course_id", name="uq_user_classroom_course"),
    )
    op.create_index("idx_classroom_courses_user_id", "classroom_courses", ["user_id"], unique=False)
    op.create_index(op.f("ix_classroom_courses_classroom_course_id"), "classroom_courses", ["classroom_course_id"], unique=False)
    op.create_index(op.f("ix_classroom_courses_id"), "classroom_courses", ["id"], unique=False)
    op.create_index(op.f("ix_classroom_courses_origin"), "classroom_courses", ["origin"], unique=False)
    op.create_index(op.f("ix_classroom_courses_user_id"), "classroom_courses", ["user_id"], unique=False)

    op.add_column("classroom_assignments", sa.Column("course_id", sa.Uuid(), nullable=False))
    op.create_index(op.f("ix_classroom_assignments_course_id"), "classroom_assignments", ["course_id"], unique=False)
    op.create_foreign_key(
        "classroom_assignments_course_id_fkey",
        "classroom_assignments",
        "classroom_courses",
        ["course_id"],
        ["id"],
        ondelete="CASCADE",
    )
