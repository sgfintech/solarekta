# Deploying SOLARekta

SOLARekta runs as **one Node.js process** with a **SQLite database file** and **private uploads on
disk** (bills, quotation files, site-survey photos, videos and signatures). It therefore needs a
host with a **persistent disk**. It does **not** run on serverless platforms such as Vercel:
their file system is temporary, so the database and uploads would be lost and pages fail with
"This page couldn't load".

The repository includes:

| File | Purpose |
| --- | --- |
| `Dockerfile` | Builds the production image (Node 22). Expects a volume at `/data`. |
| `.dockerignore` | Keeps local databases, uploads, `.env` files and backups out of the image. |
| `railway.json` | Railway settings: build from the Dockerfile, health check on `/`, restart on failure. |
| `scripts/start.mjs` | Entrypoint: prepares `/data`, creates the schema on a new database, optionally creates the first admin, starts Next.js on `PORT`. |

## What was verified

Locally, without Docker: clean `npm ci`, `npm run build`, `npm prune --omit=dev`, then
`node scripts/start.mjs` against an empty data folder. The database was created (all tables),
the admin account was created from environment variables, `/`, `/login` and `/installers`
returned 200, and a restart with a different `ADMIN_PASSWORD` left the existing account
untouched. The Docker image itself and a Railway deployment have **not** been run yet.

## Railway (recommended)

1. **New project** → *Deploy from GitHub repo* → choose `sgfintech/solarekta`.
   Railway detects `railway.json` and builds with the Dockerfile.
2. On the service, **add a Volume** with mount path **`/data`**. Without it, data is lost on
   every deploy.
3. **Variables** (service → Variables):

   | Variable | Value |
   | --- | --- |
   | `APP_URL` | The public URL, e.g. `https://solarekta.up.railway.app` (set after step 4) |
   | `ADMIN_EMAIL` | Email for the first admin account |
   | `ADMIN_PASSWORD` | At least 12 characters. **Delete this variable after the first successful start.** |
   | `ADMIN_NAME` | Optional display name |
   | `AI_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL` | Optional; the app works without AI |

   `DATABASE_PATH=/data/solarekta.db`, `UPLOAD_DIR=/data/uploads` and `NODE_ENV=production`
   are already set in the image. Railway provides `PORT`. Other optional settings are listed
   in `.env.example`.
4. **Settings → Networking → Generate Domain** (or add your own domain), then set `APP_URL`.
5. Deploy. The deploy log should show `[start] Created admin account …`. Sign in at `/login`,
   then remove `ADMIN_PASSWORD` from the variables.

Keep the service at **one replica**: SQLite and the upload folder live on one volume.

## Any other Docker host (Render, Fly.io, a VPS)

```bash
docker build -t solarekta .
docker run -d --name solarekta -p 3000:3000 \
  -v solarekta-data:/data \
  -e APP_URL=https://your-domain.example \
  -e ADMIN_EMAIL=you@example.com -e ADMIN_PASSWORD='a-long-password' \
  solarekta
```

Put HTTPS in front (the platform's proxy, Caddy or nginx). Session cookies are marked
`Secure` in production, so sign-in only works over HTTPS.

## Backups

Everything lives in `/data`: `solarekta.db` (plus `-wal`/`-shm`) and `uploads/`. Back up the
whole folder. For a consistent copy of a running database use
`sqlite3 /data/solarekta.db ".backup '/data/backup.db'"`.

## Demo data

Production starts empty. `npm run db:seed` is for local demo databases only; do not run it
against a real deployment.

## Scaling beyond one server

Running several instances requires PostgreSQL, object storage for uploads and a shared rate
limiter; see the deployment note in `.env.example`.
