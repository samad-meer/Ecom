# Century Sip — Backend (Django REST API)

Django 6 + Django REST Framework + SimpleJWT. Serves the API consumed by the web admin/storefront and the mobile app.

## Stack
- Python 3.12, Django 6, DRF, `djangorestframework-simplejwt`
- DB: PostgreSQL (local) or MySQL (shared hosting) — switched via `DB_ENGINE`
- Static via WhiteNoise; media served by Django/Passenger on shared hosting
- For production server deployment on cPanel, see [docs/deployment.md](../docs/deployment.md).

## Local setup
```bash
python -m venv .venv
.venv\Scripts\activate            # Windows  (source .venv/bin/activate on macOS/Linux)
python -m pip install -r requirements.txt
copy .env.example .env            # then fill in the values
python manage.py migrate
python manage.py seed_users       # creates admin/admin123 + sample users
python manage.py runserver 0.0.0.0:8002
```
> Runs on **port 8002** (8001 is intentionally avoided). Bind to `0.0.0.0` so a phone on the LAN can reach it.

## Environment variables (`.env`)
| Var | Purpose |
|-----|---------|
| `SECRET_KEY` | Django secret. **Required when `DEBUG=False`** (app refuses to start without it). |
| `DEBUG` | Defaults to `False` (production-safe). Set `DEBUG=True` in your local `.env`; never set it on the server. |
| `ALLOWED_HOSTS` | Comma-separated hosts (required in production). |
| `DB_ENGINE` | `postgresql` (local) or `mysql` (shared hosting). |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` / `DB_HOST` / `DB_PORT` | Database connection. |
| `CORS_ALLOWED_ORIGINS` | Comma-separated web origins allowed in production. |
| `SECURE_SSL_REDIRECT` | Optional; `True` to force HTTPS (only once the proxy forwards the scheme). |

## Layout
- `accounts/` — auth (JWT), profiles, staff/customers, **push notifications** (send + history + templates)
- `products/`, `orders/`, `support/` (complaints), `localization/`, `plant/`, `activities/`
- `core/` — settings, URLs, middleware (request logging), notifications helper

## Auth
JWT with **short access tokens (60 min) + sliding 90-day refresh** (rotation + blacklist). Clients must refresh via `POST /api/auth/token/refresh/`. Requires the `token_blacklist` migration: `python manage.py migrate token_blacklist`.
