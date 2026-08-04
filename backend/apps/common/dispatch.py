"""Safe Celery dispatch.

Background workers are a paid add-on on most managed hosts, and a broker can
be briefly unreachable even when you do run one. Neither situation should ever
turn into a failed request for the user — a writer must be able to submit work
whether or not the screening queue happens to be up.
"""
import logging

logger = logging.getLogger(__name__)


def dispatch(task, *args, **kwargs):
    """Queue `task`, falling back to running it inline, then to giving up.

    Returns one of ``"queued"``, ``"inline"`` or ``"failed"`` so the caller can
    record what actually happened.
    """
    try:
        task.delay(*args, **kwargs)
        return "queued"
    except Exception as exc:  # broker down, not configured, connection refused…
        logger.warning(
            "Could not queue %s (%s); running inline instead.", task.name, exc
        )

    try:
        task(*args, **kwargs)
        return "inline"
    except Exception:
        logger.exception("Inline execution of %s failed.", task.name)
        return "failed"
