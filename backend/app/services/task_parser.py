"""Task extraction orchestration, conservative fallback and clarification policy."""

import re

import httpx

from app.schemas.task_parser import ParseTaskRequest, ParseTaskResponse, TaskDraft
from app.services.task_dates import DeadlineEvidence, normalize, resolve_deadline
from app.services.task_llm import ExtractionProvider


def fallback_draft(request: ParseTaskRequest, evidence: DeadlineEvidence) -> TaskDraft:
    text = request.message
    for start, end in sorted(evidence.spans, reverse=True):
        text = text[:start] + " " + text[end:]
    text = re.sub(
        r"^(?:remind me to|remember to|recuérdame|recuerdame|recordarme)\s+",
        "",
        text.strip(),
        flags=re.I,
    )
    text = re.sub(r"^turn in\s+", "", text, flags=re.I)
    course = None
    for known in request.courses:
        pattern = r"\b(?:for|de|en|in)\s+" + re.escape(known) + r"\b"
        if re.search(pattern, text, re.I):
            if course is not None and course != known:
                raise ValueError("Multiple courses require clarification")
            course = known
            text = re.sub(pattern, " ", text, flags=re.I)
    text = re.sub(r"\s+", " ", text).strip(" ,;.-")
    text = re.sub(
        r"(?:\s+(?:at|on|a|las|el|para|due|vence))+$", "", text, flags=re.I
    ).strip()
    return TaskDraft(
        title=text if 0 < len(text) <= 200 else None,
        course=course,
        due_date=evidence.due_date,
    )


class NLPTaskParserService:
    def __init__(self, provider: ExtractionProvider | None = None) -> None:
        self.provider = provider

    async def parse(self, request: ParseTaskRequest) -> ParseTaskResponse:
        source = "fallback"
        try:
            evidence = resolve_deadline(request)
            draft = fallback_draft(request, evidence)
        except ValueError:
            return ParseTaskResponse(
                status="needs_clarification",
                task=TaskDraft(title=None, course=None, due_date=None),
                clarification="Please clarify the date, time, and time zone for this task.",
                source="fallback",
            )
        if self.provider:
            try:
                candidate = await self.provider.extract(request)
                draft = TaskDraft.model_validate(candidate.model_dump())
                source = self.provider.name
            except (httpx.HTTPError, ValueError):
                # Do not log student messages, upstream response bodies or credentials.
                pass
        if evidence.due_date:
            draft.due_date = evidence.due_date
        elif not evidence.has_date or not evidence.has_time:
            # A syntactically valid model response must not invent a missing deadline.
            draft.due_date = None
        question = None
        if draft.course and request.courses:
            canonical = {normalize(name): name for name in request.courses}.get(
                normalize(draft.course)
            )
            draft.course = canonical
            if canonical is None:
                question = "Which course does this task belong to?"
        if question is None and not draft.title:
            question = "What task would you like to schedule?"
        elif question is None and not draft.due_date:
            question = (
                "What time is this task due?"
                if evidence.has_date and not evidence.has_time
                else "Would you like to set a deadline for this task?"
            )
        return ParseTaskResponse(
            status="needs_clarification" if question else "parsed",
            task=draft,
            clarification=question,
            source=source,
        )
