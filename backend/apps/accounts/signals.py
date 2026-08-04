from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import ClientProfile, Role, User, WriterProfile


@receiver(post_save, sender=User)
def create_role_profile(sender, instance, created, **kwargs):
    """Every user gets the profile matching their role, plus a wallet."""
    from apps.payments.models import Wallet

    if instance.role == Role.WRITER:
        WriterProfile.objects.get_or_create(user=instance)
    elif instance.role == Role.CLIENT:
        ClientProfile.objects.get_or_create(user=instance)

    Wallet.objects.get_or_create(user=instance)
