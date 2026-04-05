# Better Expense Splitter - Project Setup Guide

This is a full-stack Docker project with React + Vite frontend and Node.js + Hono backend, featuring Auth0 authentication and SQLite database persistence.

## Quick Start

### Prerequisites

- Auth0 account (create one free at auth0.com)
- Docker and Docker Compose
- Node.js 18+ (for local development)

### Auth0 Setup

Before running the project, you need to set up Auth0:

1. Create an Auth0 account at auth0.com
2. Create a new SPA application
3. Create an API
4. Get your Domain, Client ID, and Client Secret
5. Configure callback URLs: `http://localhost:5173`

### Running with Docker Compose

```bash
# Create .env file at project root with Auth0 credentials
echo "AUTH0_DOMAIN=your-domain.auth0.com" > .env
echo "AUTH0_CLIENT_ID=your-client-id" >> .env
echo "AUTH0_CLIENT_SECRET=your-client-secret" >> .env

npm run dev
```

This starts both services:

- **Frontend**: http://localhost:5173 (React + Vite)
- **Backend**: http://localhost:3000 (Hono API)
- **Database**: SQLite in persistent Docker volume

### Stopping Services

```bash
npm run down
```

## Project Structure

- **`/client`** - React + Vite frontend application with Auth0
  - `src/` - React components and pages
  - `vite.config.ts` - Vite configuration
  - `Auth0Provider.tsx` - Auth0 provider wrapper
  - `api.ts` - API client with token handling
  - `Dockerfile` - Frontend Docker container

- **`/server`** - Node.js + Hono backend API with SQLite
  - `src/index.ts` - Hono application entry point
  - `src/db.ts` - SQLite database setup and schema
  - `src/auth.ts` - Auth0 token verification middleware
  - `data/` - SQLite database file (persistent volume)
  - `Dockerfile` - Backend Docker container

- **`docker-compose.yml`** - Docker Compose orchestration
- **`package.json`** - Root workspace configuration (npm workspaces)

## Database

SQLite database features:

- **Persistence**: Data survives container restarts via Docker volume
- **Schema**: Users, Spendings, Batches, Members tables
- **User Isolation**: All queries filtered by authenticated user ID
- **Foreign Keys**: Enforced for data integrity

Database location: `/app/data/app.db` (inside container)
Local path in docker-compose volume: `db_data:`

## Authentication

- Auth0 JWT tokens required for protected endpoints
- Tokens verified using JWKS (JSON Web Key Set)
- User ownership enforced on all data queries
- Frontend automatically attaches tokens to API requests

## Development Workflow

### Local Development (without Docker)

**Frontend:**

```bash
cd client
npm install
cp .env.example .env.local
# Edit .env.local with Auth0 credentials
npm run dev
```

**Backend:**

```bash
cd server
npm install
cp .env.example .env
# Edit .env with Auth0 credentials
npm run dev
```

### Docker Development

```bash
npm run dev
```

Both services start with:

- Hot reload for code changes (via volume mounts)
- Auto-restart on crash
- Data persistence between runs

## Environment Variables

### Frontend (client/.env.local)

```
VITE_API_URL=http://localhost:3000
VITE_AUTH0_DOMAIN=your-domain.auth0.com
VITE_AUTH0_CLIENT_ID=your-client-id
```

### Backend (server/.env)

```
PORT=3000
NODE_ENV=development
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
```

### Docker Compose (root .env)

```
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
```

## Available Scripts

### Root Level

- `npm run dev` - Start all services with Docker Compose
- `npm run build` - Build Docker images
- `npm run down` - Stop Docker containers

### Client (React + Vite)

- `npm run dev` - Start Vite dev server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

### Server (Node.js + Hono)

- `npm run dev` - Start Hono server with watch mode (tsx)
- `npm run build` - Compile TypeScript
- `npm start` - Run compiled server

## API Endpoints

### Public

- `GET /` - API information
- `GET /api/health` - Health check

### Authenticated (require Auth0 JWT token)

- `POST /api/auth/login` - Create/update user
- `GET /api/me` - Get current user profile
- `GET /api/spendings` - Get user's spendings
- `POST /api/spendings` - Create spending record
- `GET /api/groups` - Get user's groups
- `POST /api/groups` - Create group

## Data Persistence

SQLite database is stored in Docker volume that persists:

- Stop services: `npm run down` (data preserved)
- Restart services: `npm run dev` (data restored)
- Delete volume: `docker volume rm batch-spending-splitter_db_data` ⚠️ destructive

## Building for Production

```bash
npm run build
```

Then use `docker-compose -f docker-compose.yml up` with production-optimized environment variables.

## Troubleshooting

### Logging Expectations

- Keep clear request/response logs in both frontend and backend for authenticated API calls.
- Include method, route, status code, and a lightweight request identifier in backend logs.
- Log token acquisition path (access token vs ID token) and whether a token is attached on frontend requests.
- When adding new protected routes, include error logs in catch blocks so auth failures can be distinguished from application errors.

### Theme Expectations

- Keep UI theme modern and minimal.
- Avoid decorative gradients for page backgrounds unless explicitly requested.
- Do not override or restyle default DaisyUI component classes globally.
- Prefer local container/layout styling over global element overrides.

### Frontend Architecture Expectations

- Keep `client/src/App.tsx` as a thin composition root only.
- `App.tsx` may wire providers, router setup, and shared layouts, but it must not hold feature state, data fetching, business logic, or page-specific handlers.
- Put route-specific behavior in `client/src/pages/`.
- Put reusable UI and feature logic in focused components under `client/src/components/`.
- Prefer route-based navigation and dedicated pages over conditionally showing or hiding large sections inside one main page.
- If a flow has states like dashboard, profile, create, or edit, model them as routes first instead of top-level flags such as `currentView`, `showForm`, or similar in `App.tsx`.
- When refactoring, move logic downward into the smallest page or component that owns it instead of expanding `App.tsx`.

### Auth0 Login Fails

- Verify domain, client ID in environment variables
- Check Auth0 Callback URLs include `http://localhost:5173`
- Verify .env files exist in frontend and backend

### Database Errors

- Check `db_data` volume exists: `docker volume ls`
- Reset database: `docker volume rm batch-spending-splitter_db_data`
- Verify `/app/data` directory in container

### Port Conflicts

- Frontend: `npm run down` or modify 5173 in docker-compose.yml
- Backend: Modify 3000 in docker-compose.yml

### Module Not Found

```bash
cd client && npm install
cd server && npm install
npm run dev
```

## Resources

- [React Documentation](https://react.dev)
- [Vite Documentation](https://vitejs.dev)
- [Hono Documentation](https://hono.dev)
- [Auth0 Documentation](https://auth0.com/docs)
- [SQLite Documentation](https://www.sqlite.org/docs.html)
- [Docker Documentation](https://docs.docker.com)
