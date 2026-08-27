from django.contrib import admin
from django.shortcuts import redirect
from django.urls import include, path

from .oauth_views import UserInfoView

urlpatterns = [
    path("", lambda request: redirect("admin:index")),
    # Must come before admin.site.urls: Django admin's own URLconf ends in a
    # catch-all (admin/ (?P<url>.*)$) that swallows every sub-path under
    # admin/, including this one, if it's registered second -- URL patterns
    # are tried in order and Django stops at the first that resolves.
    #
    # Mounted under /admin/ rather than the conventional /o/ so it's covered
    # by the existing nginx `location /admin` proxy block without adding a
    # new one -- see dev-config/default.conf.
    # Also before oauth2_provider.urls: that module defines its own built-in
    # /userinfo/ (an OIDC endpoint, 500s since we don't have OIDC_ENABLED --
    # we're not doing OIDC, just plain OAuth2), which would otherwise shadow
    # this one since Django stops at the first matching pattern.
    # Both slash forms: Grafana builds an extra request as
    # f"{api_url}/emails" without normalizing a trailing slash on api_url
    # first, so whichever way we configure API_URL, something has to tolerate
    # the slash count actually sent.
    path("admin/o/userinfo", UserInfoView.as_view()),
    path("admin/o/userinfo/", UserInfoView.as_view(), name="userinfo"),
    path("admin/o/", include("oauth2_provider.urls", namespace="oauth2_provider")),
    path("admin/", admin.site.urls),
]
