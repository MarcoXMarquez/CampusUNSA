"""Keep private calendar subscription credentials out of application access logs."""

import logging
import re


class PrivateCalendarAccessFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple) and len(record.args) == 5:
            remote, method, path, protocol, status = record.args
            if isinstance(path, str):
                redacted = re.sub(r"(/courses/calendar/)[^/?]+\.ics(?:\?.*)?$", r"\1[redacted].ics", path)
                record.args = (remote, method, redacted, protocol, status)
        return True
