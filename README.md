# Century Sip — E-commerce Monorepo

A full-stack e-commerce + water-delivery platform:

- **`backend/`** — Django + Django REST Framework API (runs on **port 8002**)
- **`web/`** — Next.js admin panel & storefront (runs on **port 3000**)
- **`mobile-app/`** — React Native / Expo app (Expo SDK 54)

> **Port note:** the backend runs on **8002**. Port 8001 is intentionally avoided. The
> `start.ps1` / `start.bat` / `start-same-terminal.ps1` convenience scripts launch it on
> the correct port.

---

## 🚀 Quick Start

### Backend
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate          # Windows (Mac/Linux: source venv/bin/activate)
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 0.0.0.0:8002
```

### Web (Next.js)
```bash
cd web
npm install
npm run dev                       # http://localhost:3000
```

### Mobile (Expo)
```bash
cd mobile-app
npm install
npm start                         # scan the QR code with Expo Go
```

For local device testing, point the app at your LAN backend via the `USE_LOCAL` toggle —
see **[docs/network-config.md](docs/network-config.md)**.

---

## 📖 Documentation

| Doc | What |
|-----|------|
| [docs/quickstart.md](docs/quickstart.md) | Setup and day-to-day commands |
| [docs/deployment.md](docs/deployment.md) | Server deployment guide for cPanel / LiteSpeed (backend + web) |
| [docs/dependencies.md](docs/dependencies.md) | Dependency overview (authoritative source: `requirements.txt` / `package.json`) |
| [docs/network-config.md](docs/network-config.md) | Pointing the mobile app at a local vs. live backend |
| [docs/notifications.md](docs/notifications.md) | Push-notification system (models, endpoints, web vs. mobile) |
| [docs/api.md](docs/api.md) | Auth API reference |
| [docs/delivery-user-fix.md](docs/delivery-user-fix.md) | Historical: delivery-user login fix |
| [backend/README.md](backend/README.md) · [web/README.md](web/README.md) · [mobile-app/README.md](mobile-app/README.md) | Per-package notes |

---

## 📋 Features

- 🛍️ Product catalog with categories (full CRUD in web + mobile admin)
- 🛒 Cart & order management, delivery assignment
- 🚚 Plant / bottle-delivery ledger with Excel export & analytics
- 🔔 Push notifications (templates, audiences, history)
- 💬 Customer support / complaints
- 👥 Staff & customer management
- 🔐 JWT authentication (sliding refresh)

---

## 🛠️ Tech Stack

**Backend:** Django 6.0.1 · Django REST Framework · SimpleJWT · SQLite/Postgres
**Web:** Next.js · TypeScript · Tailwind
**Mobile:** React Native · Expo SDK 54 · TypeScript · React Navigation

---

## 📂 Project Structure

```
ecom-app/
├── backend/              # Django API (port 8002)
│   ├── accounts/         # auth, users, staff, notifications
│   ├── products/         # products & categories
│   ├── orders/           # order processing & delivery
│   ├── support/          # complaints
│   ├── plant/            # bottle-delivery ledger
│   ├── localization/     # multi-language
│   ├── activities/       # audit / activity logs
│   ├── core/             # settings, urls, shared helpers
│   └── requirements.txt
├── web/                  # Next.js admin & storefront (port 3000)
│   └── src/
├── mobile-app/           # React Native / Expo app
│   └── src/
├── docs/                 # project documentation
└── README.md
```

---

## 🔑 Admin

After `createsuperuser`, the Django admin is at **http://localhost:8002/admin**.

---

## 🐛 Troubleshooting

**Port already in use**
```powershell
netstat -ano | findstr :8002
taskkill /PID <PID> /F
```

**Mobile can't reach the backend** — see [docs/network-config.md](docs/network-config.md)
(check the `USE_LOCAL` toggle, same Wi-Fi, and `runserver 0.0.0.0:8002`).

More detail in [docs/quickstart.md](docs/quickstart.md).
