# Century Sip — Web (Next.js admin + storefront)

Next.js 15 (App Router) admin panel and water-themed storefront. Deployed as a **static export** to shared hosting.

## Stack
- Next.js 15, React 19, TypeScript, Tailwind CSS
- Auth via JWT (access + refresh in `localStorage`), auto-refresh on 401

## Local setup
```bash
npm install
copy .env.example .env.local      # optional — see the backend toggle below
npm run dev                        # http://localhost:3000
```

## Choosing the backend
One switch in [`src/lib/constants.ts`](src/lib/constants.ts):
```ts
const USE_LOCAL = false;  // true → http://localhost:8002 ; false → live / NEXT_PUBLIC_API_URL
```
- **Local dev:** set `USE_LOCAL = true` (talks to your local Django on :8002).
- **Production build:** keep `USE_LOCAL = false`; provide `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_MEDIA_URL` (see `.env.example`).
> ⚠️ Set `USE_LOCAL` back to `false` before building for deployment.

## Build (static export)
```bash
npm run build      # outputs static site to ./out
```
Zip `out/` and upload to the host. The app uses `output: "export"`, `trailingSlash`, and unoptimized images (`next.config.mjs`). See [docs/deployment.md](../docs/deployment.md) for full cPanel upload and `.htaccess` instructions.

## Layout
- `src/app/` — routes (admin under `/manage/*`, storefront at root)
- `src/features/` — feature modules (e.g. `notifications/` — Send Notification + template CRUD)
- `src/lib/api/` — typed API clients; `src/components/ui/` — shared UI
