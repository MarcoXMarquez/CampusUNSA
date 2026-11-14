"""Unified repository for curriculum catalog, shared LMS sources, enrollments, and assignments."""

from datetime import datetime, timezone
from typing import Dict, List, Optional, Sequence, Tuple
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.models.classroom import (
    ClassroomAssignment,
    CourseCatalog,
    CourseExternalSource,
    UserCourseEnrollment,
    UserExternalCourse,
)
from app.models.user import User
from app.schemas.academic import (
    AcademicCourseResponse,
    ExternalSourceSummaryResponse,
    PendingLinkSourceResponse,
)
from app.services.curriculum_resolver import (
    CurriculumResolverService,
    DEFAULT_TERM,
)


def _apply_detected_group(
    enrollment: UserCourseEnrollment,
    component_type: str,
    group_code: Optional[str],
    *,
    overwrite: bool = False,
) -> None:
    if not group_code:
        return
    if component_type == "LABORATORIO":
        if overwrite or enrollment.lab_group is None:
            enrollment.lab_group = group_code
    else:
        # Both TEORIA and UNICO assign theory_group by default.
        if overwrite or enrollment.theory_group is None:
            enrollment.theory_group = group_code


def _build_source_summary(source: CourseExternalSource) -> ExternalSourceSummaryResponse:
    return ExternalSourceSummaryResponse(
        source_id=source.id,
        origin=source.origin,
        external_course_id=source.external_course_id,
        raw_name=source.raw_name,
        raw_section=source.raw_section,
        component_type=source.component_type,
        alternate_link=source.alternate_link,
        mapping_status=source.mapping_status,
    )


def _build_enrollment_response(enrollment: UserCourseEnrollment) -> AcademicCourseResponse:
    sources = [link.source for link in enrollment.user_sources if link.source is not None]
    primary_source = sources[0] if sources else None
    primary_link = next((s.alternate_link for s in sources if s.alternate_link), None)
    primary_origin = primary_source.origin if primary_source else "classroom"
    return AcademicCourseResponse(
        id=enrollment.id,
        classroom_course_id=enrollment.course_code,
        name=enrollment.catalog_course.official_name,
        section=enrollment.theory_group or enrollment.lab_group or enrollment.term,
        alternate_link=primary_link,
        origin=primary_origin,
        course_code=enrollment.course_code,
        curriculum_year=enrollment.catalog_course.curriculum_year,
        theory_group=enrollment.theory_group,
        lab_group=enrollment.lab_group,
        mapping_status="LINKED",
        sources=[_build_source_summary(s) for s in sources],
        created_at=enrollment.created_at,
        updated_at=enrollment.updated_at,
    )


class AcademicSyncRepository:
    """Centralizes idempotent upserts, unification queries, and batch cleanup."""

    @staticmethod
    def _ensure_enrollment(
        db: Session,
        *,
        user_id: UUID,
        course_code: str,
        term: str,
    ) -> UserCourseEnrollment:
        enrollment = (
            db.query(UserCourseEnrollment)
            .filter(
                UserCourseEnrollment.user_id == user_id,
                UserCourseEnrollment.course_code == course_code,
                UserCourseEnrollment.term == term,
            )
            .first()
        )
        if enrollment is None:
            enrollment = UserCourseEnrollment(
                user_id=user_id,
                course_code=course_code,
                term=term,
            )
            db.add(enrollment)
            db.flush()
        return enrollment

    @staticmethod
    def _refresh_inferred_curriculum_year(db: Session, user: User) -> Optional[int]:
        linked_codes = [
            row[0]
            for row in db.query(UserCourseEnrollment.course_code)
            .filter(UserCourseEnrollment.user_id == user.id)
            .all()
        ]
        inferred = CurriculumResolverService.infer_curriculum_year(linked_codes)
        if inferred is not None:
            user.inferred_curriculum_year = inferred
        return user.inferred_curriculum_year

    @classmethod
    def upsert_course_source(
        cls,
        db: Session,
        *,
        user: User,
        external_course_id: str,
        name: str,
        origin: str,
        section: Optional[str] = None,
        alternate_link: Optional[str] = None,
        task_texts: Sequence[str] = (),
    ) -> Tuple[CourseExternalSource, UserExternalCourse, Optional[UserCourseEnrollment]]:
        """
        Idempotently upsert a shared CourseExternalSource and the student's
        UserExternalCourse + UserCourseEnrollment (when mapped).
        """
        CurriculumResolverService.ensure_catalog_seeded(db)
        term = CurriculumResolverService.extract_term(name, section)
        detected_group = CurriculumResolverService.extract_group_code(
            name,
            section,
            external_course_id,
        )

        source = (
            db.query(CourseExternalSource)
            .filter(
                CourseExternalSource.term == term,
                CourseExternalSource.origin == origin,
                CourseExternalSource.external_course_id == external_course_id,
            )
            .first()
        )

        if source is None:
            resolved = CurriculumResolverService.resolve_course(
                external_course_id=external_course_id,
                raw_name=name,
                raw_section=section,
                task_texts=task_texts,
                inferred_curriculum_year=user.inferred_curriculum_year,
            )
            source = CourseExternalSource(
                term=resolved.term,
                origin=origin,
                external_course_id=external_course_id,
                raw_name=name,
                raw_section=section,
                alternate_link=alternate_link,
                course_code=resolved.course_code,
                component_type=resolved.component_type,
                default_group_code=resolved.detected_group,
                mapping_status=resolved.mapping_status,
                mapping_source=resolved.mapping_source,
            )
            db.add(source)
            db.flush()
            if detected_group is None:
                detected_group = resolved.detected_group
        else:
            source.raw_name = name
            if section is not None:
                source.raw_section = section
            if alternate_link is not None:
                source.alternate_link = alternate_link
            if source.mapping_status != "LINKED":
                resolved = CurriculumResolverService.resolve_course(
                    external_course_id=external_course_id,
                    raw_name=name,
                    raw_section=section,
                    task_texts=task_texts,
                    inferred_curriculum_year=user.inferred_curriculum_year,
                )
                if resolved.course_code is not None:
                    source.course_code = resolved.course_code
                    source.component_type = resolved.component_type
                    source.mapping_status = "LINKED"
                    source.mapping_source = resolved.mapping_source
                    if resolved.detected_group and not source.default_group_code:
                        source.default_group_code = resolved.detected_group
            source.updated_at = datetime.now(timezone.utc)

        enrollment: Optional[UserCourseEnrollment] = None
        if source.mapping_status == "LINKED" and source.course_code:
            enrollment = cls._ensure_enrollment(
                db,
                user_id=user.id,
                course_code=source.course_code,
                term=source.term,
            )
            _apply_detected_group(
                enrollment,
                source.component_type,
                detected_group,
                overwrite=False,
            )
            cls._refresh_inferred_curriculum_year(db, user)

        user_ext = (
            db.query(UserExternalCourse)
            .filter(
                UserExternalCourse.user_id == user.id,
                UserExternalCourse.source_id == source.id,
            )
            .first()
        )
        if user_ext is None:
            user_ext = UserExternalCourse(
                user_id=user.id,
                source_id=source.id,
                enrollment_id=enrollment.id if enrollment else None,
                detected_group=detected_group,
            )
            db.add(user_ext)
            db.flush()
        else:
            user_ext.enrollment_id = enrollment.id if enrollment else user_ext.enrollment_id
            if detected_group is not None:
                user_ext.detected_group = detected_group
            user_ext.updated_at = datetime.now(timezone.utc)

        return source, user_ext, enrollment

    @classmethod
    def upsert_assignment(
        cls,
        db: Session,
        *,
        user_id: UUID,
        source_id: UUID,
        assignment_ref_id: str,
        title: str,
        origin: str,
        course_code: Optional[str] = None,
        enrollment_id: Optional[UUID] = None,
        description: Optional[str] = None,
        due_date: Optional[datetime] = None,
        max_points: Optional[float] = None,
        state: str = "PUBLISHED",
        alternate_link: Optional[str] = None,
    ) -> ClassroomAssignment:
        """Create or update a coursework assignment while preserving is_completed."""
        assignment = (
            db.query(ClassroomAssignment)
            .filter(
                ClassroomAssignment.user_id == user_id,
                ClassroomAssignment.classroom_assignment_id == assignment_ref_id,
            )
            .first()
        )
        if assignment is None:
            assignment = ClassroomAssignment(
                user_id=user_id,
                source_id=source_id,
                course_code=course_code,
                enrollment_id=enrollment_id,
                classroom_assignment_id=assignment_ref_id,
                title=title,
                description=description,
                due_date=due_date,
                max_points=max_points,
                state=state,
                alternate_link=alternate_link,
                origin=origin,
            )
            db.add(assignment)
            return assignment

        assignment.source_id = source_id
        assignment.course_code = course_code
        assignment.enrollment_id = enrollment_id
        assignment.title = title
        if description is not None:
            assignment.description = description
        assignment.due_date = due_date
        if max_points is not None:
            assignment.max_points = max_points
        assignment.state = state
        assignment.alternate_link = alternate_link
        assignment.origin = origin
        assignment.updated_at = datetime.now(timezone.utc)
        return assignment

    @classmethod
    def reconcile_user_academic_links(cls, db: Session, user: User) -> None:
        """
        Run a second resolution pass after all batch courses/assignments are stored:
        - Updates user's inferred curriculum plan (2017 vs 2025).
        - Re-evaluates PENDING_LINK sources using persisted task titles/descriptions and inferred plan.
        - Syncs enrollment_id and course_code onto UserExternalCourse and ClassroomAssignment rows.
        """
        inferred_year = cls._refresh_inferred_curriculum_year(db, user)
        user_links = (
            db.query(UserExternalCourse)
            .options(selectinload(UserExternalCourse.source))
            .filter(UserExternalCourse.user_id == user.id)
            .all()
        )
        if not user_links:
            return

        # Preload assignments for this user grouped by source_id to inspect task text hints without N+1 queries.
        user_assignments = (
            db.query(ClassroomAssignment)
            .filter(ClassroomAssignment.user_id == user.id)
            .all()
        )
        assignments_by_source: Dict[UUID, List[ClassroomAssignment]] = {}
        for item in user_assignments:
            assignments_by_source.setdefault(item.source_id, []).append(item)

        changed = False
        for link in user_links:
            source = link.source
            if source.mapping_status != "LINKED":
                source_tasks = assignments_by_source.get(source.id, [])
                # Restrict hints to assignment titles so rubric/topic keywords in descriptions never misfire.
                task_texts = [t.title.strip() for t in source_tasks if t.title and t.title.strip()]
                resolved = CurriculumResolverService.resolve_course(
                    external_course_id=source.external_course_id,
                    raw_name=source.raw_name,
                    raw_section=source.raw_section,
                    task_texts=task_texts,
                    inferred_curriculum_year=inferred_year,
                )
                if resolved.course_code is not None:
                    source.course_code = resolved.course_code
                    source.component_type = resolved.component_type
                    source.mapping_status = "LINKED"
                    source.mapping_source = resolved.mapping_source
                    if resolved.detected_group and not source.default_group_code:
                        source.default_group_code = resolved.detected_group
                    changed = True

            if source.mapping_status == "LINKED" and source.course_code:
                enrollment = cls._ensure_enrollment(
                    db,
                    user_id=user.id,
                    course_code=source.course_code,
                    term=source.term,
                )
                _apply_detected_group(
                    enrollment,
                    source.component_type,
                    link.detected_group,
                    overwrite=False,
                )
                if link.enrollment_id != enrollment.id:
                    link.enrollment_id = enrollment.id
                    changed = True
                for assignment in assignments_by_source.get(source.id, []):
                    if (
                        assignment.course_code != source.course_code
                        or assignment.enrollment_id != enrollment.id
                    ):
                        assignment.course_code = source.course_code
                        assignment.enrollment_id = enrollment.id
                        changed = True

        if changed:
            cls._refresh_inferred_curriculum_year(db, user)

    @classmethod
    def link_external_source(
        cls,
        db: Session,
        *,
        user: User,
        source_id: UUID,
        course_code: str,
        component_type: str,
        group_code: Optional[str] = None,
    ) -> CourseExternalSource:
        """
        Manually map a shared CourseExternalSource to an official CourseCatalog code
        and reconcile enrollments for all students subscribed to that source,
        applying group_code strictly to the caller's own enrollment.
        """
        CurriculumResolverService.ensure_catalog_seeded(db)

        caller_link = (
            db.query(UserExternalCourse)
            .filter(
                UserExternalCourse.user_id == user.id,
                UserExternalCourse.source_id == source_id,
            )
            .first()
        )
        if caller_link is None:
            raise LookupError("External course source not found for student")

        catalog_entry = db.query(CourseCatalog).filter(CourseCatalog.code == course_code).first()
        if catalog_entry is None:
            raise ValueError(f"Unknown curriculum course code: {course_code}")

        source = db.query(CourseExternalSource).filter(CourseExternalSource.id == source_id).one()
        source.course_code = course_code
        source.component_type = component_type
        source.mapping_status = "LINKED"
        source.mapping_source = "MANUAL"
        source.linked_by_user_id = user.id
        source.updated_at = datetime.now(timezone.utc)
        db.flush()

        all_links = (
            db.query(UserExternalCourse)
            .options(selectinload(UserExternalCourse.user))
            .filter(UserExternalCourse.source_id == source.id)
            .all()
        )
        for link in all_links:
            enrollment = cls._ensure_enrollment(
                db,
                user_id=link.user_id,
                course_code=course_code,
                term=source.term,
            )
            if link.user_id == user.id and group_code is not None:
                _apply_detected_group(
                    enrollment,
                    component_type,
                    group_code,
                    overwrite=True,
                )
            elif link.detected_group is not None:
                _apply_detected_group(
                    enrollment,
                    component_type,
                    link.detected_group,
                    overwrite=False,
                )
            link.enrollment_id = enrollment.id
            link.updated_at = datetime.now(timezone.utc)

            db.query(ClassroomAssignment).filter(
                ClassroomAssignment.user_id == link.user_id,
                ClassroomAssignment.source_id == source.id,
            ).update(
                {
                    ClassroomAssignment.course_code: course_code,
                    ClassroomAssignment.enrollment_id: enrollment.id,
                },
                synchronize_session=False,
            )
            if link.user is not None:
                cls._refresh_inferred_curriculum_year(db, link.user)

        db.commit()
        db.refresh(source)
        return source

    @staticmethod
    def update_enrollment_groups(
        db: Session,
        *,
        user_id: UUID,
        course_code: str,
        theory_group: Optional[str] = None,
        lab_group: Optional[str] = None,
        fields_to_update: Optional[set[str]] = None,
        term: str = DEFAULT_TERM,
    ) -> Optional[UserCourseEnrollment]:
        """Update caller's personal theory/lab group (A-F) on an existing enrollment."""
        enrollment = (
            db.query(UserCourseEnrollment)
            .options(
                selectinload(UserCourseEnrollment.catalog_course),
                selectinload(UserCourseEnrollment.user_sources).selectinload(UserExternalCourse.source),
            )
            .filter(
                UserCourseEnrollment.user_id == user_id,
                UserCourseEnrollment.course_code == course_code,
                UserCourseEnrollment.term == term,
            )
            .first()
        )
        if enrollment is None:
            return None

        update_set = fields_to_update if fields_to_update is not None else {"theory_group", "lab_group"}
        if "theory_group" in update_set:
            enrollment.theory_group = theory_group
        if "lab_group" in update_set:
            enrollment.lab_group = lab_group
        enrollment.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(enrollment)
        return enrollment

    @staticmethod
    def enrollment_to_response(enrollment: UserCourseEnrollment) -> AcademicCourseResponse:
        """Serialize a loaded UserCourseEnrollment into a unified AcademicCourseResponse."""
        return _build_enrollment_response(enrollment)

    @staticmethod
    def source_to_summary(source: CourseExternalSource) -> ExternalSourceSummaryResponse:
        """Serialize a CourseExternalSource into an ExternalSourceSummaryResponse."""
        return _build_source_summary(source)

    @staticmethod
    def list_catalog(
        db: Session,
        *,
        curriculum_year: Optional[int] = None,
        study_year: Optional[int] = None,
        semester: Optional[int] = None,
        q: Optional[str] = None,
    ) -> List[CourseCatalog]:
        """List official UNSA curriculum courses with optional filters."""
        CurriculumResolverService.ensure_catalog_seeded(db)
        query = db.query(CourseCatalog)
        if curriculum_year is not None:
            query = query.filter(CourseCatalog.curriculum_year == curriculum_year)
        if study_year is not None:
            query = query.filter(CourseCatalog.study_year == study_year)
        if semester is not None:
            query = query.filter(CourseCatalog.semester == semester)
        if q and q.strip():
            term_like = f"%{q.strip().upper()}%"
            query = query.filter(
                (CourseCatalog.code.ilike(term_like))
                | (CourseCatalog.normalized_name.ilike(term_like))
            )
        return query.order_by(CourseCatalog.curriculum_year.asc(), CourseCatalog.code.asc()).all()

    @staticmethod
    def list_courses(
        db: Session,
        user_id: UUID,
        *,
        origin: Optional[str] = None,
        include_pending: bool = True,
    ) -> List[AcademicCourseResponse]:
        """
        Return courses for a student.
        - When origin is None: returns unified courses (1 item per UserCourseEnrollment)
          plus any PENDING_LINK external sources so no tasks are orphaned in the UI.
        - When origin is set ('moodle' | 'classroom'): returns provider-specific external
          links for compatibility with origin-scoped endpoints.
        """
        if origin is not None:
            links = (
                db.query(UserExternalCourse)
                .options(
                    selectinload(UserExternalCourse.source).selectinload(CourseExternalSource.catalog_course),
                    selectinload(UserExternalCourse.enrollment),
                )
                .join(UserExternalCourse.source)
                .filter(
                    UserExternalCourse.user_id == user_id,
                    CourseExternalSource.origin == origin,
                )
                .order_by(CourseExternalSource.raw_name.asc())
                .all()
            )
            results: List[AcademicCourseResponse] = []
            for link in links:
                src = link.source
                cat = src.catalog_course
                enr = link.enrollment
                results.append(
                    AcademicCourseResponse(
                        id=enr.id if enr else src.id,
                        classroom_course_id=src.external_course_id,
                        name=cat.official_name if cat else src.raw_name,
                        section=src.raw_section,
                        alternate_link=src.alternate_link,
                        origin=src.origin,
                        course_code=src.course_code,
                        curriculum_year=cat.curriculum_year if cat else None,
                        theory_group=enr.theory_group if enr else None,
                        lab_group=enr.lab_group if enr else None,
                        mapping_status=src.mapping_status,
                        sources=[_build_source_summary(src)],
                        created_at=link.created_at,
                        updated_at=link.updated_at,
                    )
                )
            return results

        enrollments = (
            db.query(UserCourseEnrollment)
            .options(
                selectinload(UserCourseEnrollment.catalog_course),
                selectinload(UserCourseEnrollment.user_sources).selectinload(UserExternalCourse.source),
            )
            .filter(UserCourseEnrollment.user_id == user_id)
            .all()
        )
        unified: List[AcademicCourseResponse] = [
            _build_enrollment_response(enrollment) for enrollment in enrollments
        ]

        if include_pending:
            pending_links = (
                db.query(UserExternalCourse)
                .options(selectinload(UserExternalCourse.source))
                .join(UserExternalCourse.source)
                .filter(
                    UserExternalCourse.user_id == user_id,
                    CourseExternalSource.mapping_status == "PENDING_LINK",
                )
                .all()
            )
            for link in pending_links:
                src = link.source
                unified.append(
                    AcademicCourseResponse(
                        id=src.id,
                        classroom_course_id=src.external_course_id,
                        name=src.raw_name,
                        section=src.raw_section,
                        alternate_link=src.alternate_link,
                        origin=src.origin,
                        course_code=None,
                        curriculum_year=None,
                        theory_group=link.detected_group if src.component_type != "LABORATORIO" else None,
                        lab_group=link.detected_group if src.component_type == "LABORATORIO" else None,
                        mapping_status="PENDING_LINK",
                        sources=[_build_source_summary(src)],
                        created_at=link.created_at,
                        updated_at=link.updated_at,
                    )
                )

        unified.sort(key=lambda item: item.name)
        return unified

    @staticmethod
    def list_pending_links(db: Session, user_id: UUID) -> List[PendingLinkSourceResponse]:
        """Return student's external sources still awaiting catalog mapping."""
        pending_links = (
            db.query(UserExternalCourse)
            .options(selectinload(UserExternalCourse.source))
            .join(UserExternalCourse.source)
            .filter(
                UserExternalCourse.user_id == user_id,
                CourseExternalSource.mapping_status == "PENDING_LINK",
            )
            .order_by(CourseExternalSource.raw_name.asc())
            .all()
        )
        if not pending_links:
            return []

        source_ids = [link.source_id for link in pending_links]
        task_counts = dict(
            db.query(ClassroomAssignment.source_id, func.count(ClassroomAssignment.id))
            .filter(
                ClassroomAssignment.user_id == user_id,
                ClassroomAssignment.source_id.in_(source_ids),
            )
            .group_by(ClassroomAssignment.source_id)
            .all()
        )

        return [
            PendingLinkSourceResponse(
                source_id=link.source.id,
                term=link.source.term,
                origin=link.source.origin,
                external_course_id=link.source.external_course_id,
                raw_name=link.source.raw_name,
                raw_section=link.source.raw_section,
                alternate_link=link.source.alternate_link,
                component_type=link.source.component_type,
                detected_group=link.detected_group,
                task_count=int(task_counts.get(link.source_id, 0)),
            )
            for link in pending_links
        ]

    @staticmethod
    def list_assignments(
        db: Session,
        user_id: UUID,
        *,
        origin: Optional[str] = None,
    ) -> List[ClassroomAssignment]:
        """Return assignments for a student, optionally filtered by origin."""
        query = db.query(ClassroomAssignment).filter(ClassroomAssignment.user_id == user_id)
        if origin:
            query = query.filter(ClassroomAssignment.origin == origin)
        return query.order_by(ClassroomAssignment.due_date.asc().nullslast()).all()

    @staticmethod
    def set_assignment_completion(
        db: Session,
        *,
        user_id: UUID,
        assignment_id: UUID,
        is_completed: bool,
    ) -> Optional[ClassroomAssignment]:
        """Persist completion state for an assignment owned by the caller."""
        assignment = (
            db.query(ClassroomAssignment)
            .filter(
                ClassroomAssignment.id == assignment_id,
                ClassroomAssignment.user_id == user_id,
            )
            .first()
        )
        if assignment is None:
            return None
        assignment.is_completed = is_completed
        db.commit()
        db.refresh(assignment)
        return assignment

    @staticmethod
    def clear_assignments(
        db: Session,
        user_id: UUID,
        *,
        origin: Optional[str] = None,
    ) -> int:
        """Delete assignments for a student in a single batch SQL DELETE."""
        query = db.query(ClassroomAssignment).filter(ClassroomAssignment.user_id == user_id)
        if origin:
            query = query.filter(ClassroomAssignment.origin == origin)
        count = query.delete(synchronize_session=False)
        db.commit()
        return count

    @staticmethod
    def clear_courses(
        db: Session,
        user_id: UUID,
        *,
        origin: Optional[str] = None,
    ) -> int:
        """
        Batch remove student's external course memberships, dependent assignments,
        and orphaned enrollments without mutating shared catalog/source definitions.
        """
        link_query = db.query(UserExternalCourse.id, UserExternalCourse.source_id).filter(
            UserExternalCourse.user_id == user_id
        )
        if origin:
            link_query = link_query.join(UserExternalCourse.source).filter(
                CourseExternalSource.origin == origin
            )
        rows = link_query.all()
        if not rows:
            return 0

        link_ids = [row[0] for row in rows]
        source_ids = [row[1] for row in rows]

        db.query(ClassroomAssignment).filter(
            ClassroomAssignment.user_id == user_id,
            ClassroomAssignment.source_id.in_(source_ids),
        ).delete(synchronize_session=False)

        deleted_count = (
            db.query(UserExternalCourse)
            .filter(UserExternalCourse.id.in_(link_ids))
            .delete(synchronize_session=False)
        )

        # Clean up enrollments belonging to this student that no longer have any remaining source link.
        active_enrollment_ids = [
            row[0]
            for row in db.query(UserExternalCourse.enrollment_id)
            .filter(
                UserExternalCourse.user_id == user_id,
                UserExternalCourse.enrollment_id.isnot(None),
            )
            .distinct()
            .all()
        ]
        orphan_query = db.query(UserCourseEnrollment).filter(
            UserCourseEnrollment.user_id == user_id
        )
        if active_enrollment_ids:
            orphan_query = orphan_query.filter(
                UserCourseEnrollment.id.notin_(active_enrollment_ids)
            )
        orphan_query.delete(synchronize_session=False)

        db.commit()
        return deleted_count
