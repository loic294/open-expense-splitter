# Batch Spending Splitter - Project Setup Guide

This is a full-stack Docker project with React + Vite frontend and Node.js + Hono backend.

## Quick Start

### Running with Docker Compose

```bash
npm run dev
```

This starts both services:

- **Frontend**: http://localhost:5173 (React + Vite)
- **Backend**: http://localhost:3000 (Hono API)

### Stopping Services

```bash
npm run down
```

## Project Structure

- **`/client`** - React + Vite frontend application
  - `src/` - React components and pages
  - `vite.config.ts` - Vite configuration
  - `Dockerfile` - Frontend Docker container

- **`/server`** - Node.js + Hono backend API
  - `src/index.ts` - Hono application entry point
  - `tsconfig.json` - TypeScript configuration
  - `Dockerfile` - Backend Docker container

- **`docker-compose.yml`** - Docker Compose orchestration
- **`package.json`** - Root workspace configuration (npm workspaces)

## Development Workflow

### Local Development (without Docker)

**Frontend:**

```bash
cd client
npm install
npm run dev
```

**Backend:**

```bash
cd server
npm install
npm run dev
```

### Docker Development

```bash
npm run dev
```

Both services will start with hot-reload enabled via volume mounts.

## Environment Variables

- **Frontend** (`.env.local` in `/client`):
  - `VITE_API_URL` - Backend API URL (default: http://localhost:3000)

- **Backend** (`.env` in `/server`):
  - `PORT` - Server port (default: 3000)
  - `NODE_ENV` - Environment (default: development)

See `.env.example` files in each directory for reference.

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

- `npm run dev` - Start Hono server with watch mode
- `npm run build` - Compile TypeScript
- `npm start` - Run compiled server

## API Endpoints

- `GET /` - API information
- `GET /api/health` - Health check endpoint

## Building Production Images

```bash
npm run build
```

Then run with:

```bash
docker compose up
```

Or with production optimizations in `docker-compose.yml`.

## Troubleshooting

### Port Already in Use

If ports 5173 (frontend) or 3000 (backend) are in use:

- Modify port mappings in `docker-compose.yml`
- Or: `npm run down` to stop existing containers

### Module Not Found Errors

```bash
cd client && npm install
cd server && npm install
```

### Docker Build Issues

```bash
docker compose build --no-cache
npm run dev
```

## Resources

- [React Documentation](https://react.dev)
- [Vite Documentation](https://vitejs.dev)
- [Hono Documentation](https://hono.dev)
- [Docker Documentation](https://docs.docker.com)
