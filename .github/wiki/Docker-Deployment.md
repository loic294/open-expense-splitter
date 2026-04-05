# Docker Deployment

Deploy using Docker and Docker Compose for a containerized setup.

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/loic294/open-expense-splitter.git
cd batch-spending-splitter
```

### 2. Create `.env` file

```bash
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret

# Optional: For production deployments
PUBLIC_FRONTEND_URL=https://app.example.com
PUBLIC_BACKEND_URL=https://api.example.com
```

See [Installation](Installation.md) for Auth0 setup.

### 3. Start services

```bash
npm run dev
```

Access the app:

- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3000

### 4. Stop services

```bash
npm run down
```

Data persists in Docker volumes between restarts.

---

## Using Pre-built Images

Use published Docker images from GitHub Container Registry without cloning:

### 1. Create `docker-compose.yml`

```yaml
version: "3.8"

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
      - PUBLIC_FRONTEND_URL=${PUBLIC_FRONTEND_URL:-http://localhost:5173}
      - AUTH0_DOMAIN=${AUTH0_DOMAIN}
      - AUTH0_CLIENT_ID=${AUTH0_CLIENT_ID}
      - AUTH0_CLIENT_SECRET=${AUTH0_CLIENT_SECRET}
    volumes:
      - db_data:/app/data

volumes:
  db_data:
```

### 2. Create `.env`

```bash
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
```

### 3. Start

```bash
docker compose up
```

---

## Environment Variables

All variables are loaded from the root `.env` file into both services:

- **Frontend** receives `VITE_*` prefixed variables
- **Backend** receives raw variable names

See [Environment Variables](Environment-Variables.md) for complete reference.

---

## Data Persistence

SQLite database is stored in Docker volume `db_data`:

- **Persists** across container restarts
- **Deleted** with: `docker volume rm batch-spending-splitter_db_data` ⚠️

---

## Troubleshooting

### Port Already in Use

Modify ports in `docker-compose.yml`:

```yaml
ports:
  - "5174:5173" # Use 5174 instead of 5173
```

Then restart:

```bash
npm run down
npm run dev
```

### Images Not Found

Pull latest images:

```bash
docker compose pull
docker compose up
```

---

See [Quick Start](Quick-Start.md) to get running in seconds.
