# Environment Variables Reference

## For Docker Deployments

All variables are defined **once** in the root `.env` file. Docker Compose automatically reads and passes them to both services.

### Root `.env` Template

```bash
# ====== Required: Auth0 ======
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret

# ====== Optional: Production URLs ======
PUBLIC_FRONTEND_URL=https://app.example.com
PUBLIC_BACKEND_URL=https://api.example.com
```

---

## For Local Development

### Frontend: `client/.env.local`

```bash
VITE_API_URL=http://localhost:3000
VITE_AUTH0_DOMAIN=your-domain.auth0.com
VITE_AUTH0_CLIENT_ID=your-client-id

# Production (optional)
VITE_PUBLIC_BACKEND_URL=https://api.example.com
```

### Backend: `server/.env`

```bash
PORT=3000
NODE_ENV=development

AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret

# Production (optional)
PUBLIC_FRONTEND_URL=https://app.example.com
```

---

## Variable Resolution Order

### Frontend API URL

The frontend resolves the API URL in this order:

1. `VITE_PUBLIC_BACKEND_URL` (production)
2. `VITE_API_URL` (fallback)
3. `http://localhost:3000` (default)

### Backend CORS Origin

The backend resolves the frontend URL in this order:

1. `PUBLIC_FRONTEND_URL` (production)
2. `http://localhost:5173` (default)

---

## Complete Variables Reference

| Variable              | Used By           | Purpose                                   | Required           |
| --------------------- | ----------------- | ----------------------------------------- | ------------------ |
| `AUTH0_DOMAIN`        | Backend, Frontend | Auth0 tenant domain                       | ✅                 |
| `AUTH0_CLIENT_ID`     | Backend, Frontend | Auth0 application ID                      | ✅                 |
| `AUTH0_CLIENT_SECRET` | Backend only      | Auth0 application secret                  | ✅ (backend)       |
| `PUBLIC_BACKEND_URL`  | Frontend          | Public backend URL for production         | ❌                 |
| `PUBLIC_FRONTEND_URL` | Backend           | Public frontend URL for production        | ❌                 |
| `PORT`                | Backend only      | Server port (Node.js)                     | ❌ (default: 3000) |
| `NODE_ENV`            | Backend only      | Environment mode (development/production) | ❌                 |

---

## Getting Started

1. See [Installation](Installation.md) to set up Auth0 credentials
2. See [Quick Start](Quick-Start.md) for Docker setup
3. See [Local Development](Local-Development.md) for local setup without Docker
