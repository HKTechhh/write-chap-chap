from celery import shared_task


@shared_task(name="apps.accounts.tasks.recalculate_all_writer_tiers")
def recalculate_all_writer_tiers():
    """Nightly sweep so tier badges never drift from the underlying stats."""
    from .models import WriterProfile

    changed = 0
    for profile in WriterProfile.objects.all().iterator():
        before = profile.tier
        if profile.recalculate_tier() != before:
            changed += 1
    return {"profiles_updated": changed}
