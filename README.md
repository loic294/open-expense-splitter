# Batch Spending Splitter

A full-stack application for tracking and splitting spending across batches. Built with React + Vite on the frontend and Node.js + Hono on the backend.

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript
- **Backend**: Node.js, Hono, TypeScript
- **Containerization**: Docker & Docker Compose
- **Package Manager**: npm (workspaces)

## Project Structure

```
batch-spending-splitter/
├── client/                 # React + Vite frontend
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── Dockerfile
│   └── tsconfig.json
├── server/                 # Node.js + Hono backend
│   ├── src/
│   ├── package.json
│   ├── Dockerfile
│   └── tsconfig.json
├── docker-compose.yml
└── package.json           # Root workspace package.json
```

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development without Docker)
- npm

### Running with Docker Compose

```bash
npm run dev
```

This will start both the frontend and backend services:

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

### Stopping the Services

```bash
npm run down
```

### Building Docker Images

```bash
npm run build
```

## Local Development (without Docker)

### Frontend Setup

```bash
cd client
npm install
npm run dev
```

### Backend Setup

```bash
cd server
npm install
npm run dev
```

## Environment Variables

Create `.env` files as needed:

- `client/.env.local` for frontend environment variables
- `server/.env` for backend environment variables

## API Endpoints

The backend exposes the following endpoints:

- `GET /api/health` - Health check

More endpoints will be added as features are developed.

## Contributing

1. Create a feature branch
2. Make your changes
3. Test locally
4. Submit a pull request

## License

MIT
# batch-spending-splitter
