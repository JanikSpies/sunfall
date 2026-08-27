FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN pip install --no-cache-dir pipenv

WORKDIR /app

COPY Pipfile Pipfile.lock ./
RUN pipenv install --system --deploy --ignore-pipfile

COPY . .
RUN chmod +x docker-entrypoint.sh

FROM base AS dev

ENV DJANGO_DEBUG=true

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

# Static files (Django admin's own CSS/JS) are collected once at build time,
# not at container start -- keeps prod startup fast and the final image
# doesn't need a real DATABASE_URL/SECRET_KEY to build (see settings.py).
FROM base AS build

RUN python manage.py collectstatic --noinput

# Small final image: no pipenv, no apt build tooling (psycopg[binary] ships
# prebuilt wheels, so none was ever needed), no source-controlled cruft --
# just the installed packages and the app itself.
FROM python:3.13-slim AS prod

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN adduser --disabled-password --gecos "" --uid 1000 sunfall

WORKDIR /app

COPY --from=build /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=build /usr/local/bin /usr/local/bin
COPY --from=build /app /app

RUN chown -R sunfall:sunfall /app
USER sunfall

EXPOSE 8000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2"]
