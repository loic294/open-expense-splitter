# Cloudflare Deployment

Deploy the backend as a **Cloudflare Worker** and frontend as **Cloudflare Pages**.

## One-time Setup

### 1. Create D1 Database

```bash
cd server
npx wrangler d1 create batch-spending-splitter
```

Copy the `database_id` from the output and add it to `server/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "batch-spending-splitter"
database_id = "YOUR-DATABASE-ID"
```

### 2. Apply Database Schema

```bash
# Local development
npx wrangler d1 migrations apply batch-spending-splitter --local

# Production
npx wrangler d1 migrations apply batch-spending-splitter --remote
```

### 3. Create Pages Project

```bash
npx wrangler pages project create batch-spending-splitter
```

---

## Development

Start local development with D1 database:

```bash
cd server
npm run worker:dev
```

Backend will run at http://localhost:8787 with local D1 database.

---

## Manual Deploy

### Deploy Backend (Worker)

```bash
cd server
npm run worker:deploy
```

### Deploy Frontend (Pages)

```bash
cd client
npm run build
npx wrangler pages deploy dist --project-name=batch-spending-splitter
```

---

## Automated Deploy (GitHub Actions)

### 1. Create GitHub Secrets

Go to your repository **Settings → Secrets and variables → Actions** and add:

| Secret                  | Value                      |
| ----------------------- | -------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Your Cloudflare API token  |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |

### 2. Create GitHub Variables

Go to **Settings → Secrets and variables → Variables** and add:

| Variable          | Value                          |
| ----------------- | ------------------------------ |
| `AUTH0_DOMAIN`    | your-domain.auth0.com          |
| `AUTH0_CLIENT_ID` | Your Auth0 SPA client ID       |
| `CF_WORKER_URL`   | https://worker-url.workers.dev |

### 3. Deploy

The GitHub Actions workflow runs automatically on every push to `main`:

1. Applies pending D1 migrations
2. Deploys the Worker
3. Builds and deploys the frontend to Pages

---

## Environment Variables for Cloudflare

Set these in `server/wrangler.toml`:

```toml
[env.production]
vars = { AUTH0_DOMAIN = "your-domain.auth0.com", AUTH0_CLIENT_ID = "your-client-id" }

[env.production.secrets]
AUTH0_CLIENT_SECRET = "your-secret"
PUBLIC_FRONTEND_URL = "https://app.example.com"
```

See [Environment Variables](Environment-Variables.md) for complete reference.

---

## Troubleshooting

### Database Errors

Check D1 database is properly created:

```bash
npx wrangler d1 info batch-spending-splitter
```

### Deploy Fails

Verify you have correct Cloudflare credentials:

```bash
npx wrangler whoami
```

---

See [Quick Start](Quick-Start.md) for Docker-based deployment instead.
