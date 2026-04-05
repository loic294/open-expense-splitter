# Open Expense Splitter

A full-stack application for tracking and splitting spending across batches. Built with React + Vite on the frontend and Node.js + Hono on the backend, with SQLite for persistent data storage and Auth0 for user authentication.

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Auth0
- **Backend**: Node.js, Hono, TypeScript, SQLite
- **Database**: SQLite (persistent across Docker runs)
- **Authentication**: Auth0
- **Containerization**: Docker & Docker Compose
- **Optional Deployment**: Cloudflare Workers + Pages
- **Package Manager**: npm (workspaces)

## Features

- 🔐 **User Authentication**: Secure login via Auth0
- 💾 **Persistent Data**: SQLite database with Docker volume persistence
- 📊 **Spending Tracking**: Track individual and batch spending
- 🔒 **Data Privacy**: Users can only view their own data
- 📱 **Responsive UI**: Modern React interface with daisyUI components
- 🚀 **Hot Reload**: Development with instant reload
- ☁️ **Serverless Ready**: Optional deployment to Cloudflare Workers

## Frontend Architecture

- Keep `client/src/App.tsx` limited to providers, router setup, and shared layouts
- Put page-level behavior in `client/src/pages/`
- Put reusable feature logic and UI in `client/src/components/`
- Prefer route-based navigation for flows like dashboard, profile, group creation, and group editing

## Project Structure

```
batch-spending-splitter/
├── client/                 # React + Vite frontend
│   ├── src/
│   │   ├── App.tsx
│   │   ├── Auth0Provider.tsx
│   │   ├── api.ts
│   │   └── ...
│   ├── package.json
│   ├── vite.config.ts
│   ├── wrangler.toml       # Cloudflare Pages config
│   ├── Dockerfile
│   └── .env.example
├── server/                 # Node.js + Hono backend
│   ├── src/
│   │   ├── index.ts        # Node.js / Docker entry point
│   │   ├── worker.ts       # Cloudflare Workers entry point
│   │   ├── db.ts           # SQLite database setup
│   │   ├── auth.ts         # Auth0 middleware
│   │   └── ...
│   ├── migrations/         # D1 database migrations
│   ├── package.json
│   ├── wrangler.toml       # Cloudflare Workers config
│   ├── Dockerfile
│   ├── data/               # SQLite database (persistent volume)
│   └── .env.example
├── docker-compose.yml      # Local Docker development
├── .env.example            # Root environment template
├── package.json            # Root workspace config
└── README.md
```

## Prerequisites

- Auth0 account (free at https://auth0.com)
- Docker and Docker Compose (for local Docker development)
- Node.js 18+ (for local development without Docker)
- npm or yarn

## Setting Up Auth0

1. **Create a Free Auth0 Account** at https://auth0.com

2. **Create a Single Page Application (SPA)**:
   - Applications → Applications → Create Application
   - Select "Single Page Web Application" and choose React

3. **Configure Callback URLs** (Settings tab):
   - Allowed Callback URLs: `http://localhost:5173`
   - Allowed Logout URLs: `http://localhost:5173`
   - Allowed Web Origins: `http://localhost:5173`

4. **Create an API** (Applications → APIs → Create API):
   - Name: "Batch Spending Splitter API"
   - Identifier: `https://your-domain.auth0.com/api` (any unique identifier)

5. **Get Your Credentials** from the SPA application Settings tab:
   - Domain: e.g., `yourname.auth0.com`
   - Client ID: Your application's client ID

## Quick Start with Docker

### 1. Clone and Setup

```bash
git clone <repository>
cd batch-spending-splitter
```

### 2. Create Environment File

Create a single `.env` file at the project root with your Auth0 credentials:

```bash
# Required: Auth0 Configuration
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret

# Optional: Auth0 API Audience
AUTH0_AUDIENCE=https://your-domain.auth0.com/api

# Optional: Public URLs for production deployments
PUBLIC_FRONTEND_URL=https://app.example.com
PUBLIC_BACKEND_URL=https://api.example.com
```

For development, you can omit the `PUBLIC_*` variables:

```bash
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
```

### 3. Start Services

```bash
npm run dev
```

This starts:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **Database**: SQLite (persists in Docker volume)

### 4. Stop Services

```bash
npm run down
```

Data persists between restarts via Docker volumes.

## Local Development (Without Docker)

### Frontend Setup

```bash
cd client
npm install
cp .env.example .env.local
```

Edit `client/.env.local`:

```bash
VITE_API_URL=http://localhost:3000
VITE_AUTH0_DOMAIN=your-domain.auth0.com
VITE_AUTH0_CLIENT_ID=your-client-id
VITE_AUTH0_AUDIENCE=your-api-identifier
```

Start development server:

```bash
npm run dev  # Frontend runs on http://localhost:5173
```

### Backend Setup

```bash
cd server
npm install
cp .env.example .env
```

Edit `server/.env`:

```bash
PORT=3000
NODE_ENV=development
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AUTH0_AUDIENCE=your-api-identifier
```

Start development server:

```bash
npm run dev  # Backend runs on http://localhost:3000
```

## Deploy with Pre-built Docker Images

The frontend and backend publish Docker images automatically to GitHub Container Registry. Use this `docker-compose.yml` to run the latest images:

```yaml
version: '3.8'

services:
  frontend:
    image: ghcr.io/loicba/batch-spending-splitter-client:latest
    ports:
      - "5173:5173"
    environment:
      - VITE_PUBLIC_BACKEND_URL=${PUBLIC_BACKEND_URL:-http://localhost:3000}
      - VITE_AUTH0_DOMAIN=${AUTH0_DOMAIN}
      - VITE_AUTH0_CLIENT_ID=${AUTH0_CLIENT_ID}
    depends_on:
      - backend

  backend:
    image: ghcr.io/loicba/batch-spending-splitter-server:latest
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - PUBLIC_FRONTEND_URL=${PUBLIC_FRONTEND_URL:-http://localhost:5173}
      - AUTH0_DOMAIN=${AUTH0_DOMAIN}
      - AUTH0_CLIENT_ID=${AUTH0_CLIENT_ID}
      - AUTH0_CLIENT_SECRET=${AUTH0_CLIENT_SECRET}
    volumes:
      - db_data:/app/data

volumes:
  db_data:
```

Create `.env` with your Auth0 credentials:

```bash
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
PUBLIC_BACKEND_URL=https://api.example.com    # optional
PUBLIC_FRONTEND_URL=https://app.example.com   # optional
```

Start the stack:

```bash
docker compose up
```

## Deploy to Cloudflare (Optional)

Deploy the backend as a **Cloudflare Worker** (serverless) and frontend as **Cloudflare Pages**.

### One-time Setup

```bash
# Create D1 database
cd server
npx wrangler d1 create batch-spending-splitter

# Copy the database_id into server/wrangler.toml

# Apply schema to local and production
npx wrangler d1 migrations apply batch-spending-splitter --local
npx wrangler d1 migrations apply batch-spending-splitter --remote

# Create Pages project
npx wrangler pages project create batch-spending-splitter
```

### Local Development

```bash
cd server
npm run worker:dev  # Runs on http://localhost:8787 with local D1
```

### Manual Deploy

```bash
# Deploy Worker
cd server && npm run worker:deploy

# Build and deploy frontend
cd client && npm run build && npx wrangler pages deploy dist --project-name=batch-spending-splitter
```

### Automated Deploy (GitHub Actions)

Create GitHub repository secrets (Settings → Secrets and variables → Actions):

| Secret                  | Value                           |
| ----------------------- | ------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Your Cloudflare API token       |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID      |

Create GitHub repository variables (Settings → Secrets and variables → Variables):

| Variable          | Value                                            |
| ----------------- | ------------------------------------------------ |
| `AUTH0_DOMAIN`    | your-domain.auth0.com                          |
| `AUTH0_CLIENT_ID` | Your Auth0 SPA client ID                        |
| `CF_WORKER_URL`   | https://worker-url.workers.dev                  |

The deployment workflow runs automatically on every push to `main`.

## Environment Variables Reference

### How It Works

**Docker Compose** reads variables from a single root `.env` file and passes them to containers. Variables are automatically prefixed with `VITE_` for the frontend to access them via `import.meta.env`.

**Local Development** uses separate `.env.local` (frontend) and `.env` (backend) files for flexibility.

### Variable Definitions

#### Root `.env` (Docker Compose - Single Source of Truth)

```bash
# ====== Auth0 Configuration (Required) ======
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret

# ====== Optional: Auth0 API Audience ======
AUTH0_AUDIENCE=https://your-domain.auth0.com/api

# ====== Optional: Public URLs (Production) ======
# If set, these override internal localhost URLs for production deployments
PUBLIC_BACKEND_URL=https://api.example.com
PUBLIC_FRONTEND_URL=https://app.example.com
```

#### `client/.env.local` (Frontend Local Dev Only)

```bash
VITE_API_URL=http://localhost:3000
VITE_AUTH0_DOMAIN=your-domain.auth0.com
VITE_AUTH0_CLIENT_ID=your-client-id
VITE_AUTH0_AUDIENCE=your-api-identifier
```

#### `server/.env` (Backend Local Dev Only)

```bash
PORT=3000
NODE_ENV=development
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AUTH0_AUDIENCE=your-api-identifier
PUBLIC_FRONTEND_URL=https://app.example.com  # optional for production URLs
```

### Variable Resolution Order

**Frontend API URL** (client/src/api.ts):
1. `VITE_PUBLIC_BACKEND_URL` (production)
2. `VITE_API_URL` (legacy fallback)
3. `http://localhost:3000` (development default)

**Backend CORS Origin** (server/src/index.ts):
1. `PUBLIC_FRONTEND_URL` (production)
2. `http://localhost:5173` (development default)

### All Available Variables

| Variable | Used By | Purpose | Required |
|----------|---------|---------|----------|
| `AUTH0_DOMAIN` | Backend, Frontend | Auth0 tenant domain | ✅ |
| `AUTH0_CLIENT_ID` | Backend, Frontend | Auth0 application ID | ✅ |
| `AUTH0_CLIENT_SECRET` | Backend only | Auth0 application secret | ✅ (backend) |
| `AUTH0_AUDIENCE` | Backend, Frontend | Auth0 API audience identifier | ❌ |
| `PUBLIC_BACKEND_URL` | Frontend | Public API URL for production | ❌ |
| `PUBLIC_FRONTEND_URL` | Backend | Public frontend URL for production | ❌ |
| `PORT` | Backend only | Server port (Node.js) | ❌ (default: 3000) |
| `NODE_ENV` | Backend only | Environment mode | ❌ (default: development) |

## API Endpoints

### Public

- `GET /` - API information
- `GET /api/health` - Health check

### Authenticated (require Auth0 JWT)

- `POST /api/auth/login` - Create/update user on login
- `GET /api/me` - Get current user profile
- `GET /api/spendings` - Get user's spendings
- `POST /api/spendings` - Create spending record
- `GET /api/groups` - Get user's groups
- `POST /api/groups` - Create group
- `POST /api/spendings/import` - Import spendings from CSV
- `GET /api/invites/:code` - Get invite details
- `POST /api/invites/:code/accept` - Accept group invite

## Database Schema

**users**
- `id, auth0_id, email, name, picture, created_at, updated_at`

**spendings**
- `id, user_id, description, amount, category, date, created_at`

**batches**
- `id, owner_id, name, description, created_at, updated_at`

**batch_members**
- `id, batch_id, user_id, created_at`

**batch_items**
- `id, batch_id, spending_id, paid_by_id, amount, description, created_at`

**currency_preferences**
- `id, user_id, currency, created_at, updated_at`

**invites**
- `id, batch_id, code, created_at, expires_at`

## Data Persistence

### Docker

SQLite database stored in Docker volume (`db_data`):
- **Persists**: Container restarts and `npm run down`
- **Deleted**: `docker volume rm batch-spending-splitter_db_data` ⚠️

### Cloudflare

Uses D1 database (serverless SQLite):
- **Persists**: Automatically in Cloudflare
- **Schema**: Managed via migrations in `server/migrations/`

## Available Scripts

### Root Level

- `npm run dev` - Start Docker services
- `npm run build` - Build Docker images
- `npm run down` - Stop Docker services

### Frontend (`client/`)

- `npm run dev` - Start Vite dev server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

### Backend (`server/`)

- `npm run dev` - Start Node.js dev server with hot reload
- `npm run build` - Compile TypeScript
- `npm start` - Run compiled server
- `npm run worker:dev` - Start Cloudflare Workers local dev
- `npm run worker:deploy` - Deploy to Cloudflare Workers

## Troubleshooting

### Auth0 Login Fails

- Verify `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID` are correct
- Check Auth0 Callback URLs include `http://localhost:5173`
- Ensure `.env` variables are set

### Port Already in Use

```bash
npm run down
# or modify ports in docker-compose.yml
```

### Database Issues

```bash
# Check volume
docker volume ls

# Reset database
docker volume rm batch-spending-splitter_db_data

# Rebuild
npm run dev
```

### Module Not Found

```bash
cd client && npm install
cd server && npm install
npm run dev
```

## Contributing

1. Fork and create a feature branch
2. Make changes and test locally
3. Submit a pull request

## License

MIT

## Resources

- [React Docs](https://react.dev)
- [Vite Docs](https://vitejs.dev)
- [Hono Docs](https://hono.dev)
- [Auth0 Docs](https://auth0.com/docs)
- [SQLite Docs](https://www.sqlite.org)
- [Docker Docs](https://docs.docker.com)
- [Cloudflare Docs](https://developers.cloudflare.com)
