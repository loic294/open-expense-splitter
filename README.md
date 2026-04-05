# Open Expense Splitter

A full-stack application for tracking and splitting spending across batches. Built with React + Vite on the frontend and Node.js + Hono on the backend, with SQLite for persistent data storage and Auth0 for user authentication.

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Auth0
- **Backend**: Node.js, Hono, TypeScript, SQLite
- **Database**: SQLite (persistent across Docker runs)
- **Authentication**: Auth0
- **Containerization**: Docker & Docker Compose
- **Package Manager**: npm (workspaces)

## Features

- 🔐 **User Authentication**: Secure login via Auth0
- 💾 **Persistent Data**: SQLite database with Docker volume persistence
- 📊 **Spending Tracking**: Track individual and batch spending
- 🔒 **Data Privacy**: Users can only view their own data
- 📱 **Responsive UI**: Modern React interface with Tailwind-inspired styling
- 🚀 **Hot Reload**: Development with instant reload

## Frontend Architecture

- Keep `client/src/App.tsx` limited to providers, router setup, and shared layouts.
- Put page-level behavior in `client/src/pages/`.
- Put reusable feature logic and UI in `client/src/components/`.
- Prefer route-based navigation for flows like dashboard, profile, group creation, and group editing instead of toggling sections on one page.

## Project Structure

```
open-expense-splitter/
├── client/                 # React + Vite frontend
│   ├── src/
│   │   ├── App.tsx
│   │   ├── Auth0Provider.tsx
│   │   ├── api.ts
│   │   └── ...
│   ├── package.json
│   ├── vite.config.ts
│   ├── Dockerfile
│   └── .env.example
├── server/                 # Node.js + Hono backend
│   ├── src/
│   │   ├── index.ts
│   │   ├── db.ts
│   │   ├── auth.ts
│   │   └── ...
│   ├── package.json
│   ├── Dockerfile
│   ├── data/              # SQLite database (persistent volume)
│   └── .env.example
├── docker-compose.yml
└── package.json           # Root workspace package.json
```

## Prerequisites

### For Docker Deployment

- Docker and Docker Compose
- Auth0 account (https://auth0.com)

### For Local Development

- Node.js 18+
- npm
- Auth0 account

## Setting Up Auth0

1. **Create an Auth0 Account**: Go to [auth0.com](https://auth0.com) and sign up for a free account

2. **Create a Single Page Application (SPA)**:
   - Go to Applications > Applications
   - Click "Create Application"
   - Select "Single Page Web Application"
   - Choose React as the technology

3. **Configure the Application**:
   - Go to Settings
   - Set **Allowed Callback URLs**: `http://localhost:5173`
   - Set **Allowed Logout URLs**: `http://localhost:5173`
   - Set **Allowed Web Origins**: `http://localhost:5173`

4. **Create an API**:
   - Go to Applications > APIs
   - Click "Create API"
   - Name: "Open Expense Splitter API"
   - Identifier: `https://your-auth0-domain/api/v2/` (or any unique identifier)

5. **Get Your Credentials**:
   - From the SPA application settings, copy:
     - **Domain**: Your Auth0 domain (e.g., `yourname.auth0.com`)
     - **Client ID**: Your application's client ID

## Deploy with Pre-built Images

The frontend and backend images are published to the GitHub Container Registry. You can run the full stack without cloning the repository using the following `docker-compose.yml`:

```yaml
services:
  frontend:
    image: ghcr.io/loic294/open-expense-splitter-client:latest
    ports:
      - "5173:5173"
    environment:
      - VITE_API_URL=http://localhost:3000
      - VITE_AUTH0_DOMAIN=${AUTH0_DOMAIN}
      - VITE_AUTH0_CLIENT_ID=${AUTH0_CLIENT_ID}
    depends_on:
      - backend

  backend:
    image: ghcr.io/loic294/open-expense-splitter-server:latest
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - AUTH0_DOMAIN=${AUTH0_DOMAIN}
      - AUTH0_CLIENT_ID=${AUTH0_CLIENT_ID}
      - AUTH0_CLIENT_SECRET=${AUTH0_CLIENT_SECRET}
    volumes:
      - db_data:/app/data

volumes:
  db_data:
```

Create a `.env` file alongside it and start the stack:

```bash
# .env
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
```

```bash
docker compose up
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

---

## Deploy to Cloudflare (optional)

The backend can run as a **Cloudflare Worker** (using Cloudflare D1 for storage) and the frontend as a **Cloudflare Pages** site. The Docker / Node.js setup is not affected.

### One-time setup

```bash
# 1. Create the D1 database and copy the database_id into server/wrangler.toml
cd server
npx wrangler d1 create batch-spending-splitter

# 2. Apply the schema
npx wrangler d1 migrations apply batch-spending-splitter --local   # local dev
npx wrangler d1 migrations apply batch-spending-splitter --remote  # production

# 3. Create the Cloudflare Pages project (only required once)
npx wrangler pages project create batch-spending-splitter
```

Update `server/wrangler.toml` with the `database_id` from step 1 and set the correct `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, and `APP_BASE_URL` values.

### Local development against D1

```bash
cd server
npm run worker:dev   # starts wrangler dev with local D1 on http://localhost:8787
```

### Manual deploy

```bash
cd server && npm run worker:deploy                         # deploy the Worker
cd client && npm run build && npx wrangler pages deploy dist --project-name=batch-spending-splitter
```

### Automated deploy (GitHub Actions)

The [deploy-cloudflare workflow](.github/workflows/deploy-cloudflare.yml) runs on every push to `main` and:

1. Applies any pending D1 migrations
2. Deploys the Worker
3. Builds the frontend and deploys it to Cloudflare Pages

**Required repository secrets** (Settings → Secrets → Actions):

| Secret                  | Description                                                  |
| ----------------------- | ------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare API token with Workers, D1, and Pages permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID                                   |

**Required repository variables** (Settings → Variables → Actions):

| Variable          | Description                                                                             |
| ----------------- | --------------------------------------------------------------------------------------- |
| `AUTH0_DOMAIN`    | e.g. `yourapp.auth0.com`                                                                |
| `AUTH0_CLIENT_ID` | Auth0 SPA client ID                                                                     |
| `CF_WORKER_URL`   | Deployed Worker URL, e.g. `https://batch-spending-splitter-api.<subdomain>.workers.dev` |

---

## Getting Started with Docker

1. **Clone the repository and navigate to the project**:

```bash
cd open-expense-splitter
```

2. **Create environment files**:

**`.env` file at the root** (for docker-compose):

```bash
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
```

**`client/.env.local`**:

```bash
VITE_API_URL=http://localhost:3000
VITE_AUTH0_DOMAIN=your-domain.auth0.com
VITE_AUTH0_CLIENT_ID=your-client-id
```

**`server/.env`**:

```bash
PORT=3000
NODE_ENV=development
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
```

3. **Start the services**:

```bash
npm run dev
```

This will start:

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

4. **Stop the services**:

```bash
npm run down
```

## Local Development (without Docker)

### Frontend Setup

```bash
cd client
npm install
cp .env.example .env.local
# Edit .env.local with your Auth0 credentials
npm run dev
```

The frontend will be available at http://localhost:5173

### Backend Setup

```bash
cd server
npm install
cp .env.example .env
# Edit .env with your Auth0 credentials
npm run dev
```

The backend will be available at http://localhost:3000

## API Endpoints

### Public Endpoints

- `GET /` - API information
- `GET /api/health` - Health check

### Authenticated Endpoints

- `POST /api/auth/login` - Create/update user on login
- `GET /api/me` - Get current authenticated user profile
- `GET /api/spendings` - Get user's spending records (only their own)
- `POST /api/spendings` - Create a spending record
- `GET /api/groups` - Get user's groups (owner or member)
- `POST /api/groups` - Create a group

## Database Schema

The SQLite database includes:

- **users**: User profiles synced from Auth0
  - `id`, `auth0_id`, `email`, `name`, `picture`, `created_at`, `updated_at`

- **spendings**: Individual spending records
  - `id`, `user_id`, `description`, `amount`, `category`, `date`, `created_at`

- **batches**: Batch groups for splitting
  - `id`, `owner_id`, `name`, `description`, `created_at`, `updated_at`

- **batch_members**: Participants in each batch
  - `id`, `batch_id`, `user_id`, `created_at`

- **batch_items**: Individual items in batches
  - `id`, `batch_id`, `spending_id`, `paid_by_id`, `amount`, `description`, `created_at`

## Data Persistence

The SQLite database is stored in a Docker volume (`db_data`) that persists between container runs. This means:

- Your data will survive container restarts
- The database file is located at `/app/data/app.db` inside the container
- Use `npm run down` to stop services without losing data
- Use `docker volume rm open-expense-splitter_db_data` to delete all data (⚠️ destructive)

## Environment Variables Reference

### Frontend (client/.env.local)

```
VITE_API_URL=http://localhost:3000          # Backend API URL
VITE_AUTH0_DOMAIN=your-domain.auth0.com     # Auth0 domain
VITE_AUTH0_CLIENT_ID=your-client-id         # Auth0 application client ID
```

### Backend (server/.env)

```
PORT=3000                          # Server port
NODE_ENV=development               # Environment (development/production)
AUTH0_DOMAIN=your-domain.auth0.com # Auth0 domain
AUTH0_CLIENT_ID=your-client-id     # Auth0 application client ID
AUTH0_CLIENT_SECRET=your-secret    # Auth0 application client secret
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

## Troubleshooting

### Auth0 Login Not Working

- Verify your Auth0 domain, client ID, and credentials are correct
- Check that callback URLs are properly configured in Auth0
- Ensure environment variables are set correctly in `.env.local` (frontend) and `.env` (backend)

### Port Already in Use

- Stop existing containers: `npm run down`
- Or modify port mappings in `docker-compose.yml`

### Database Issues

- Check that the `data` directory exists in the server container
- Verify the volume is properly mounted: `docker volume ls`
- Reset database: `docker volume rm open-expense-splitter_db_data`

### Module Not Found

```bash
cd client && npm install
cd server && npm install
```

### Docker Build Issues

```bash
docker compose build --no-cache
npm run dev
```

## User Data Privacy

- **User Isolation**: Users can only view their own spending data
- **Authentication**: All protected endpoints require valid Auth0 tokens
- **Database Constraints**: Foreign key constraints ensure data integrity
- **User Verification**: Backend middleware validates token ownership

## Contributing

1. Create a feature branch
2. Make your changes
3. Test locally with both services running
4. Submit a pull request

## License

MIT

## Resources

- [React Documentation](https://react.dev)
- [Vite Documentation](https://vitejs.dev)
- [Hono Documentation](https://hono.dev)
- [Auth0 Documentation](https://auth0.com/docs)
- [SQLite Documentation](https://www.sqlite.org/docs.html)
- [Docker Documentation](https://docs.docker.com)
