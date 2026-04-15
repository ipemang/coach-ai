# syntax=docker/dockerfile:1

FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/backend

WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/

EXPOSE 8000

# Shell form so $PORT is expanded at runtime (Railway injects PORT env var)
CMD sh -c "cd /app/backend && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"
