"""
Idempotently creates/updates the admin login from env vars, so a fresh deploy
(or a dev's first `docker compose up`) has a working account without an
interactive `createsuperuser` prompt. No-ops quietly if the env vars aren't
set -- nothing to do yet, not an error.
"""

import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Create or update the superuser from DJANGO_SUPERUSER_* env vars."

    def handle(self, *args, **options):
        username = os.environ.get("DJANGO_SUPERUSER_USERNAME", "").strip()
        email = os.environ.get("DJANGO_SUPERUSER_EMAIL", "").strip()
        password = os.environ.get("DJANGO_SUPERUSER_PASSWORD", "").strip()

        if not (username and password):
            self.stdout.write("DJANGO_SUPERUSER_USERNAME/PASSWORD not set, skipping.")
            return

        User = get_user_model()
        user, created = User.objects.get_or_create(
            username=username,
            defaults={"email": email, "is_staff": True, "is_superuser": True},
        )

        user.email = email
        user.is_staff = True
        user.is_superuser = True
        user.set_password(password)
        user.save()

        self.stdout.write(self.style.SUCCESS(f"{'Created' if created else 'Updated'} superuser {username!r}."))
