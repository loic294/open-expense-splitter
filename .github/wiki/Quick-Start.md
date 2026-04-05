# Quick Start

## With Docker (Recommended)

### 1. Clone the repository

```bash
git clone https://github.com/loic294/open-expense-splitter.git
cd batch-spending-splitter
```

### 2. Create environment file

Create a `.env` file at the project root:

```bash
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
```

See [Installation](Installation.md) for Auth0 setup instructions.

### 3. Start services

```bash
npm run dev
```

Access the app at:

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000

### 4. Stop services

```bash
npm run down
```

---

## Pre-built Docker Images

Use the latest pre-built images without cloning:

```bash
docker compose up
```

With this `docker-compose.yml`:

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

Create `.env`:

```bash
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
```

---

See [Installation](Installation.md) to set up Auth0 credentials.
