"""
Curriculum resolution engine matching external LMS courses (Google Classroom, DUTIC Moodle)
to canonical UNSA Systems Engineering catalog courses (2017 and 2025 plans).
"""

import json
import re
import unicodedata
from dataclasses import dataclass
from typing import Dict, List, Optional, Protocol, Sequence, Tuple

from sqlalchemy.orm import Session

from app.core.curriculum_catalog_data import CURRICULUM_CATALOG_ENTRIES, CurriculumCatalogEntry
from app.models.classroom import CourseCatalog

VALID_GROUP_CODES: frozenset[str] = frozenset({"A", "B", "C", "D", "E", "F"})
VALID_COMPONENTS: frozenset[str] = frozenset({"TEORIA", "LABORATORIO", "UNICO"})
DEFAULT_TERM = "2026B"

_TERM_PATTERN = re.compile(r"(?:^|[^0-9])(?:20)?(2\d[AB])(?:_|$|[^A-Za-z0-9])", re.IGNORECASE)
_CODE_PATTERN = re.compile(
    r"(?:^|[^0-9])((?:17|25)\d{5})([A-F])?(?=$|[^0-9A-Za-z])",
    re.IGNORECASE,
)
_EXPLICIT_GROUP_PATTERN = re.compile(r"\b(?:GRUPO|GRP)\.?\s*([A-F])\b", re.IGNORECASE)
_LAB_PAREN_GROUP_PATTERN = re.compile(r"\b(?:LAB|LABORATORIO|TEO|TEORIA)\s*\(([A-F])\)\s*$", re.IGNORECASE)
_HYPHEN_GROUP_PATTERN = re.compile(r"(?:\s+-|[-])\s*([A-F])\s*$", re.IGNORECASE)
_TRAILING_GROUP_WORD_PATTERN = re.compile(r"\s+([A-F])\s*$", re.IGNORECASE)
_LAB_KEYWORD_PATTERN = re.compile(r"\b(?:LAB|LABORATORIO|PRACTICA|PRAC)\b", re.IGNORECASE)
_TEORIA_KEYWORD_PATTERN = re.compile(r"\b(?:TEORIA|TEO)\b", re.IGNORECASE)
_NOISE_WRAPPER_PATTERN = re.compile(
    r"(?:^\s*CURSO\s+|\(\s*LABORATORIO\s*\)|\(\s*TEORIA\s*\)|\(\s*E\s*\)"
    r"|\(\s*20\d{2}[AB]\s*\)|(?:\s+-|[-])\s*[A-F]\s*$|\b(?:GRUPO|GRP)\.?\s*[A-F]\b)",
    re.IGNORECASE,
)


def normalize_course_text(text: str) -> str:
    """Normalize text by stripping diacritics, punctuation, and redundant whitespace."""
    decomposed = unicodedata.normalize("NFKD", text)
    ascii_upper = "".join(ch for ch in decomposed if not unicodedata.combining(ch)).upper()
    cleaned = re.sub(r"[^A-Z0-9\s]", " ", ascii_upper)
    return re.sub(r"\s+", " ", cleaned).strip()


def normalize_course_title_for_match(raw_title: str) -> str:
    """Strip common structural labels (e.g. '- A', '(Laboratorio)', 'Curso') before catalog comparison."""
    stripped = raw_title or ""
    # Strip trailing '(E)' (Elective) or group/component markers without altering core words.
    for _ in range(3):
        next_stripped = _NOISE_WRAPPER_PATTERN.sub(" ", stripped).strip()
        if next_stripped == stripped:
            break
        stripped = next_stripped
    normalized = normalize_course_text(stripped)
    return re.sub(r"\s+E$", "", normalized).strip()


class CourseHeuristicMatcherProtocol(Protocol):
    """Extension hook for future fuzzy or LLM-backed course matching strategies."""

    def suggest_course_code(
        self,
        *,
        raw_name: str,
        raw_section: Optional[str],
        task_texts: Sequence[str],
        inferred_curriculum_year: Optional[int],
        catalog_entries: Sequence[CurriculumCatalogEntry],
    ) -> Optional[str]:
        """Return a candidate catalog course code or None when uncertain."""
        ...


@dataclass(frozen=True)
class ResolvedCourseMatch:
    """Structured deterministic resolution output for an external course space."""

    term: str
    course_code: Optional[str]
    component_type: str
    detected_group: Optional[str]
    mapping_status: str
    mapping_source: Optional[str]


_CATALOG_BY_CODE: Dict[str, CurriculumCatalogEntry] = {
    entry["code"]: entry for entry in CURRICULUM_CATALOG_ENTRIES
}
_CATALOG_BY_NORMALIZED_NAME: Dict[str, List[CurriculumCatalogEntry]] = {}
for _entry in CURRICULUM_CATALOG_ENTRIES:
    _CATALOG_BY_NORMALIZED_NAME.setdefault(_entry["normalized_name"], []).append(_entry)

_TASK_HINT_PHRASES_CACHE: Optional[
    Tuple[Tuple[str, re.Pattern[str], List[CurriculumCatalogEntry]], ...]
] = None


def _get_task_hint_phrases() -> (
    Tuple[Tuple[str, re.Pattern[str], List[CurriculumCatalogEntry]], ...]
):
    """Build and cache whole-phrase regexes lazily so lightweight workers avoid startup RAM."""
    global _TASK_HINT_PHRASES_CACHE
    if _TASK_HINT_PHRASES_CACHE is None:
        _TASK_HINT_PHRASES_CACHE = tuple(
            (
                norm_name,
                re.compile(rf"(?:^|\s){re.escape(norm_name)}(?:\s|$)"),
                group_entries,
            )
            for norm_name, group_entries in sorted(
                _CATALOG_BY_NORMALIZED_NAME.items(),
                key=lambda item: len(item[0]),
                reverse=True,
            )
            if len(norm_name) >= 10
        )
    return _TASK_HINT_PHRASES_CACHE


class CurriculumResolverService:
    """Deterministic resolver linking Classroom/DUTIC courses to UNSA curriculum codes."""

    @staticmethod
    def ensure_catalog_seeded(db: Session) -> None:
        """Idempotently populate course_catalog when running on a clean database (e.g. SQLite tests)."""
        bind = None
        try:
            bind = db.get_bind()
            if getattr(bind, "_curriculum_catalog_seeded", False):
                return
        except Exception:
            bind = None
        if db.query(CourseCatalog.code).limit(1).first() is not None:
            if bind is not None:
                try:
                    setattr(bind, "_curriculum_catalog_seeded", True)
                except Exception:
                    pass
            return
        db.bulk_save_objects(
            [
                CourseCatalog(
                    code=entry["code"],
                    curriculum_year=entry["curriculum_year"],
                    official_name=entry["official_name"],
                    normalized_name=entry["normalized_name"],
                    category=entry["category"],
                    study_year=entry["study_year"],
                    semester=entry["semester"],
                    department=entry["department"],
                    credits=entry["credits"],
                    prerequisites_json=json.dumps(entry["prerequisites"]),
                    min_credits_required=entry["min_credits_required"],
                    theory_hours=entry["theory_hours"],
                    practice_hours=entry["practice_hours"],
                    lab_hours=entry["lab_hours"],
                )
                for entry in CURRICULUM_CATALOG_ENTRIES
            ]
        )
        db.flush()
        if bind is not None:
            try:
                setattr(bind, "_curriculum_catalog_seeded", True)
            except Exception:
                pass

    @staticmethod
    def get_catalog_entry(code: str) -> Optional[CurriculumCatalogEntry]:
        """Look up an official catalog course in memory by 7-digit code."""
        return _CATALOG_BY_CODE.get(code)

    @staticmethod
    def extract_term(raw_name: str, raw_section: Optional[str] = None) -> str:
        """Extract academic term code like '26B' -> '2026B', defaulting to DEFAULT_TERM."""
        for candidate in (raw_section or "", raw_name or ""):
            match = _TERM_PATTERN.search(candidate)
            if match:
                short_term = match.group(1).upper()
                return f"20{short_term}"
        return DEFAULT_TERM

    @staticmethod
    def extract_component_type(raw_name: str, raw_section: Optional[str] = None) -> str:
        """Classify source component as LABORATORIO, TEORIA, or UNICO."""
        combined = f"{raw_name or ''} {raw_section or ''}"
        if _LAB_KEYWORD_PATTERN.search(combined):
            return "LABORATORIO"
        if _TEORIA_KEYWORD_PATTERN.search(combined):
            return "TEORIA"
        return "UNICO"

    @staticmethod
    def extract_official_code_and_group(
        external_course_id: str,
        raw_name: str,
        raw_section: Optional[str] = None,
    ) -> Tuple[Optional[str], Optional[str]]:
        """Extract verified 7-digit UNSA course code and optional attached group (A-F)."""
        for text in (raw_section or "", raw_name or "", external_course_id or ""):
            for match in _CODE_PATTERN.finditer(text):
                code = match.group(1)
                if code in _CATALOG_BY_CODE:
                    grp = match.group(2).upper() if match.group(2) else None
                    return code, grp if grp in VALID_GROUP_CODES else None
        return None, None

    @staticmethod
    def extract_group_code(
        raw_name: str,
        raw_section: Optional[str] = None,
        external_course_id: str = "",
    ) -> Optional[str]:
        """
        Extract student group letter (A-F) deterministically without mistaking '(E)' (Electivo)
        for Group E unless explicitly stated in section or 'Grupo E'.
        """
        _, attached_grp = CurriculumResolverService.extract_official_code_and_group(
            external_course_id,
            raw_name,
            raw_section,
        )
        if attached_grp:
            return attached_grp

        section_clean = (raw_section or "").strip().upper()
        if section_clean in VALID_GROUP_CODES:
            return section_clean

        for text in (raw_section or "", raw_name or ""):
            explicit = _EXPLICIT_GROUP_PATTERN.search(text)
            if explicit:
                return explicit.group(1).upper()

        # Guard against trailing '(E)' meaning Electivo inside official course titles.
        name_trimmed = re.sub(r"\(\s*E\s*\)\s*$", "", raw_name or "", flags=re.IGNORECASE).strip()

        for pattern in (_LAB_PAREN_GROUP_PATTERN, _HYPHEN_GROUP_PATTERN):
            m = pattern.search(name_trimmed)
            if m:
                candidate = m.group(1).upper()
                if candidate in VALID_GROUP_CODES:
                    return candidate

        trailing = _TRAILING_GROUP_WORD_PATTERN.search(name_trimmed)
        if trailing and len(name_trimmed.split()) >= 2:
            candidate = trailing.group(1).upper()
            if candidate in VALID_GROUP_CODES:
                return candidate

        return None

    @staticmethod
    def _pick_by_curriculum(
        candidates: Sequence[CurriculumCatalogEntry],
        inferred_curriculum_year: Optional[int],
        *,
        enforce_inferred_year: bool = False,
    ) -> Optional[CurriculumCatalogEntry]:
        if not candidates:
            return None
        pool = list(candidates)
        if enforce_inferred_year and inferred_curriculum_year in (2017, 2025):
            pool = [c for c in pool if c["curriculum_year"] == inferred_curriculum_year]
            if not pool:
                return None
        if len(pool) == 1:
            return pool[0]
        if inferred_curriculum_year in (2017, 2025):
            filtered = [c for c in pool if c["curriculum_year"] == inferred_curriculum_year]
            if len(filtered) == 1:
                return filtered[0]
        return None

    @classmethod
    def resolve_course(
        cls,
        *,
        external_course_id: str,
        raw_name: str,
        raw_section: Optional[str] = None,
        task_texts: Sequence[str] = (),
        inferred_curriculum_year: Optional[int] = None,
        heuristic_matcher: Optional[CourseHeuristicMatcherProtocol] = None,
    ) -> ResolvedCourseMatch:
        """
        Resolve an external course using deterministic rules only:
        1. Official 7-digit CASI code in section/name/id
        2. Exact normalized official name (disambiguated by student's curriculum year)
        3. Official course name mentioned cleanly in assignment titles/descriptions
        4. Optional pluggable heuristic/LLM matcher (disabled by default)
        """
        term = cls.extract_term(raw_name, raw_section)
        component_type = cls.extract_component_type(raw_name, raw_section)
        detected_group = cls.extract_group_code(raw_name, raw_section, external_course_id)

        # 1. Exact 7-digit code match
        code, attached_grp = cls.extract_official_code_and_group(
            external_course_id,
            raw_name,
            raw_section,
        )
        if code is not None:
            return ResolvedCourseMatch(
                term=term,
                course_code=code,
                component_type=component_type,
                detected_group=attached_grp or detected_group,
                mapping_status="LINKED",
                mapping_source="CODE_MATCH",
            )

        # 2. Exact normalized official name match
        for candidate_title in (raw_name, raw_section or ""):
            normalized_title = normalize_course_title_for_match(candidate_title)
            if not normalized_title:
                continue
            entries = _CATALOG_BY_NORMALIZED_NAME.get(normalized_title)
            if entries:
                picked = cls._pick_by_curriculum(entries, inferred_curriculum_year)
                if picked is not None:
                    return ResolvedCourseMatch(
                        term=term,
                        course_code=picked["code"],
                        component_type=component_type,
                        detected_group=detected_group,
                        mapping_status="LINKED",
                        mapping_source="NAME_MATCH",
                    )

        # 3. Deterministic assignment text hint matching (no fuzzy guessing)
        if task_texts:
            matched_norm_names: set[str] = set()
            matched_entries_by_norm: Dict[str, List[CurriculumCatalogEntry]] = {}
            for raw_task in task_texts:
                norm_task = normalize_course_text(raw_task)
                if not norm_task:
                    continue
                for norm_name, pattern, entries in _get_task_hint_phrases():
                    if norm_name in norm_task and pattern.search(norm_task):
                        matched_norm_names.add(norm_name)
                        matched_entries_by_norm[norm_name] = entries
                        break
            if len(matched_norm_names) == 1:
                only_norm = next(iter(matched_norm_names))
                picked = cls._pick_by_curriculum(
                    matched_entries_by_norm[only_norm],
                    inferred_curriculum_year,
                    enforce_inferred_year=True,
                )
                if picked is not None:
                    return ResolvedCourseMatch(
                        term=term,
                        course_code=picked["code"],
                        component_type=component_type,
                        detected_group=detected_group,
                        mapping_status="LINKED",
                        mapping_source="TASK_HINT",
                    )

        # 4. Future pluggable heuristic/LLM hook (inactive unless caller provides one)
        if heuristic_matcher is not None:
            suggested_code = heuristic_matcher.suggest_course_code(
                raw_name=raw_name,
                raw_section=raw_section,
                task_texts=task_texts,
                inferred_curriculum_year=inferred_curriculum_year,
                catalog_entries=CURRICULUM_CATALOG_ENTRIES,
            )
            if suggested_code and suggested_code in _CATALOG_BY_CODE:
                return ResolvedCourseMatch(
                    term=term,
                    course_code=suggested_code,
                    component_type=component_type,
                    detected_group=detected_group,
                    mapping_status="LINKED",
                    mapping_source="HEURISTIC",
                )

        return ResolvedCourseMatch(
            term=term,
            course_code=None,
            component_type=component_type,
            detected_group=detected_group,
            mapping_status="PENDING_LINK",
            mapping_source=None,
        )

    @staticmethod
    def infer_curriculum_year(course_codes: Sequence[str]) -> Optional[int]:
        """Infer whether a student belongs to Plan 2017 or Plan 2025 from linked course codes."""
        count_2017 = 0
        count_2025 = 0
        for code in course_codes:
            entry = _CATALOG_BY_CODE.get(code)
            if entry is None:
                continue
            if entry["curriculum_year"] == 2017:
                count_2017 += 1
            elif entry["curriculum_year"] == 2025:
                count_2025 += 1
        if count_2017 == 0 and count_2025 == 0:
            return None
        if count_2017 > count_2025:
            return 2017
        if count_2025 > count_2017:
            return 2025
        return None
