# Andesia

B2B SaaS platform for endurance sports coaches. AI augments the coach's workflow — it never replaces the coach.

## Quick Start

- **Backend:** See [`backend/README.md`](backend/README.md)
- **Frontend:** See [`frontend/README.md`](frontend/README.md)
- **Dev context:** See [`CLAUDE.md`](CLAUDE.md) — read this before any session

## Production

| Service | URL |
|---------|-----|
| Backend API | https://coach-ai-production-a5aa.up.railway.app |
| Coach Dashboard | https://coach-dashboard-production-ae22.up.railway.app |

## Stack

- **Backend:** FastAPI (Python 3.12) on Railway
- **Frontend:** Next.js 14 App Router on Railway
- **Database:** Supabase (PostgreSQL + pgvector)
- **AI:** OpenAI GPT-4o-mini via provider-agnostic `LLMClient`
- **Messaging:** Meta WhatsApp Cloud API
