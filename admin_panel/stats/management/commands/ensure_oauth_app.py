"""
Idempotently creates/updates the OAuth2 Application that Grafana authenticates
as, from env vars -- same reasoning as ensure_superuser: a fresh deploy or a
dev's first `docker compose up` should have a working "Sign in with Django"
button in Grafana with no manual step through the Django admin UI.
"""

import os

from django.core.management.base import BaseCommand
from oauth2_provider.models import get_application_model

Application = get_application_model()

# Fixed so re-running this command always finds and updates the same row
# instead of creating duplicates.
CLIENT_NAME = "grafana"


class Command(BaseCommand):
    help = "Create or update the Grafana OAuth2 Application from OAUTH_* env vars."

    def handle(self, *args, **options):
        client_id = os.environ.get("OAUTH_CLIENT_ID", "").strip()
        client_secret = os.environ.get("OAUTH_CLIENT_SECRET", "").strip()
        redirect_uri = os.environ.get("OAUTH_REDIRECT_URI", "").strip()

        if not (client_id and client_secret and redirect_uri):
            self.stdout.write("OAUTH_CLIENT_ID/SECRET/REDIRECT_URI not set, skipping.")
            return

        app, created = Application.objects.get_or_create(
            name=CLIENT_NAME,
            defaults={
                "client_id": client_id,
                "redirect_uris": redirect_uri,
                "client_type": Application.CLIENT_CONFIDENTIAL,
                "authorization_grant_type": Application.GRANT_AUTHORIZATION_CODE,
                "skip_authorization": True,
            },
        )

        app.client_id = client_id
        app.client_secret = client_secret
        app.redirect_uris = redirect_uri
        app.client_type = Application.CLIENT_CONFIDENTIAL
        app.authorization_grant_type = Application.GRANT_AUTHORIZATION_CODE
        # First-party integration we control end-to-end, not a third-party app
        # asking a user for permission -- skip the consent screen.
        app.skip_authorization = True
        app.save()

        self.stdout.write(self.style.SUCCESS(f"{'Created' if created else 'Updated'} OAuth application {CLIENT_NAME!r}."))
