from django.db import models


class TimeStampedModel(models.Model):
    """Abstract base giving every record a created/updated audit trail."""

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
