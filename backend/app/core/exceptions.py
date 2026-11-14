"""Domain exceptions for external LMS integrations (Google Classroom and DUTIC Moodle)."""


class GoogleClassroomError(Exception):
    """Base exception for Google Classroom API errors."""


class GoogleClassroomAuthError(GoogleClassroomError):
    """Raised when Google Classroom OAuth token is expired or revoked (HTTP 401)."""


class GoogleClassroomRateLimitError(GoogleClassroomError):
    """Raised when Google Classroom API quota is exceeded (HTTP 429)."""


class DuticError(Exception):
    """Base exception for DUTIC Moodle integration errors."""


DuticMoodleError = DuticError


class DuticSessionExpiredError(DuticError):
    """Raised when the MoodleSession cookie or sesskey is invalid or expired."""


class DuticRateLimitError(DuticError):
    """Raised when Moodle rate limit or concurrency throttle is encountered."""
