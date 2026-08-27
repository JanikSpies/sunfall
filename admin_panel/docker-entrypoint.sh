#!/bin/sh
set -e

python manage.py migrate --noinput
python manage.py ensure_superuser
python manage.py ensure_oauth_app

exec "$@"
