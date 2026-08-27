"""
django-oauth-toolkit provides the authorize/token endpoints for us, but not a
userinfo endpoint for plain OAuth2 clients (that's an OIDC thing, and setting
up full OIDC just for Grafana would mean signing keys we don't need). Grafana's
generic_oauth just needs a JSON endpoint it can hit with the access token it
already has -- this is that endpoint.
"""

from django.http import JsonResponse
from oauth2_provider.views.generic import ProtectedResourceView


class UserInfoView(ProtectedResourceView):
    def get(self, request, *args, **kwargs):
        user = request.resource_owner

        return JsonResponse(
            {
                "sub": str(user.pk),
                "login": user.username,
                "email": user.email,
                "name": user.get_full_name() or user.username,
                "groups": ["admin"] if user.is_superuser else [],
            }
        )
