# Installation & Auth0 Setup

## Prerequisites

- **Auth0 account** (free at https://auth0.com)
- **Docker & Docker Compose** (for Docker deployment)
- **Node.js 18+** (for local development)
- **npm or yarn**

## Auth0 Setup

### 1. Create a Free Auth0 Account

Sign up at https://auth0.com

### 2. Create a Single Page Application (SPA)

1. Go to **Applications → Applications**
2. Click **Create Application**
3. Select **Single Page Web Application**
4. Choose **React** as the technology
5. Click **Create**

### 3. Configure Callback URLs

In the application **Settings** tab:

- **Allowed Callback URLs**: `http://localhost:5173`
- **Allowed Logout URLs**: `http://localhost:5173`
- **Allowed Web Origins**: `http://localhost:5173`

For production, also add your production URL:

- `https://app.example.com`

### 4. Create an API

1. Go to **Applications → APIs**
2. Click **Create API**
3. Fill in:
   - **Name**: `Batch Spending Splitter API`
   - **Identifier**: `https://your-domain.auth0.com/api` (or any unique identifier)
4. Click **Create**

### 5. Get Your Credentials

From your SPA application's **Settings** tab, copy:

- **Domain**: e.g., `yourname.auth0.com`
- **Client ID**: Your application's client ID

These go in your `.env` file:

```bash
AUTH0_DOMAIN=yourname.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
```

---

## Next Steps

- [Quick Start](Quick-Start.md) - Get up and running with Docker
- [Local Development](Local-Development.md) - Develop without Docker
- [Docker Deployment](Docker-Deployment.md) - Deploy with Docker
- [Cloudflare Deployment](Cloudflare-Deployment.md) - Deploy to Cloudflare
