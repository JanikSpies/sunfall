"""
Django settings for the Sunfall admin/stats panel.

Everything environment-specific comes from env vars (see ../.example.env) --
there's no separate dev/prod settings module, just different values for the
same keys, wired up in docker-compose.dev.yml / docker-compose.yml.
"""

import os
import sys
from pathlib import Path

import dj_database_url
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def env_list(name: str, default: str = "") -> list[str]:
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


DEBUG = env_bool("DJANGO_DEBUG", False)

# Building the prod image runs `collectstatic` (and a dev might run
# `makemigrations`) without any real runtime env vars available yet -- those
# commands don't touch secrets or the database, so give them harmless
# placeholders instead of failing the build.
BUILD_TIME_COMMAND = any(cmd in sys.argv for cmd in ("makemigrations", "collectstatic"))

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "").strip()
if not SECRET_KEY:
    if DEBUG:
        # Fine for a throwaway local instance -- sessions just reset on restart.
        SECRET_KEY = "insecure-dev-only-secret-key"
    elif BUILD_TIME_COMMAND:
        SECRET_KEY = "build-time-placeholder"
    else:
        raise ImproperlyConfigured(
            "DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is not enabled."
        )

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "oauth2_provider",
    "stats",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
if not DATABASE_URL:
    if BUILD_TIME_COMMAND:
        DATABASE_URL = "postgres://build:build@localhost:5432/build"
    else:
        raise ImproperlyConfigured("DATABASE_URL must be set (postgres://user:pass@host:port/db).")

DATABASES = {
    "default": dj_database_url.parse(DATABASE_URL, conn_max_age=600),
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Europe/Zurich"
USE_I18N = True
USE_TZ = True

# Namespaced under /admin/ rather than the site root: the whole app is
# reachable at /admin/ through dev_proxy / prod's reverse proxy (see
# dev-config/default.conf), and nginx doesn't rewrite the path, so Django's
# own asset URLs need to already include that prefix.
STATIC_URL = "/admin/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Nobody gets in without a login -- the whole app is the Django admin, and
# admin views already require an authenticated staff account by default. This
# just makes sure cookies aren't handed out over plain HTTP once TLS is in
# front of this (toggle off with DJANGO_SECURE_COOKIES=false if you're not
# terminating TLS yet, e.g. testing a fresh prod deploy before DNS/certs).
SECURE_COOKIES = env_bool("DJANGO_SECURE_COOKIES", not DEBUG)
SESSION_COOKIE_SECURE = SECURE_COOKIES
CSRF_COOKIE_SECURE = SECURE_COOKIES
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Django admin owns the only login page in this app -- point django-oauth-toolkit's
# @login_required at it instead of the nonexistent default /accounts/login/.
LOGIN_URL = "/admin/login/"

# Django as an OAuth2 provider, so Grafana can offer "Sign in with Django"
# instead of a separate account. Grafana is the only client and is a
# confidential, server-side app (it holds the client secret and exchanges the
# code itself), so PKCE isn't needed. skip_authorization on the registered
# Application (see ensure_oauth_app) skips the consent screen -- it's a
# first-party integration, not a third-party app asking for permission.
OAUTH2_PROVIDER = {
    "SCOPES": {"read": "Read access to your Django account info"},
    "PKCE_REQUIRED": False,
}
