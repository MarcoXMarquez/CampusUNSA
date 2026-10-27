"""Authenticated preview endpoint; persistence and WhatsApp dispatch belong to US-11."""

from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import has_role
from app.core.config import settings
from app.models.user import User
from app.schemas.task_parser import ParseTaskRequest, ParseTaskResponse
from app.services.task_llm import StructuredLLMClient
from app.services.task_parser import NLPTaskParserService

router = APIRouter()


def get_task_parser() -> NLPTaskParserService:
    provider = None
    if settings.TASK_PARSER_PROVIDER != "disabled":
        try:
            provider = StructuredLLMClient(settings)
        except ValueError as error:
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "PARSER_NOT_CONFIGURED",
                    "message": "Task extraction provider configuration is incomplete.",
                },
            ) from error
    return NLPTaskParserService(provider)


@router.post("/parse-task", response_model=ParseTaskResponse)
async def parse_task(
    payload: ParseTaskRequest,
    current_user: User = Depends(has_role(["student"])),
    parser: NLPTaskParserService = Depends(get_task_parser),
) -> ParseTaskResponse:
    """Extract a draft or request clarification without creating a database record."""
    return await parser.parse(payload)
