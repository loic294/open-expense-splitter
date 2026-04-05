# Local Development (Without Docker)

Run the frontend and backend on your local machine without Docker.

## Frontend Setup

### 1. Install dependencies

```bash
cd client
npm install
```

### 2. Create environment file

```bash
cp .env.example .env.local
```

### 3. Edit `.env.local`

```bash
VITE_API_URL=http://localhost:3000
VITE_AUTH0_DOMAIN=your-domain.auth0.com
VITE_AUTH0_CLIENT_ID=your-client-id
VITE_AUTH0_AUDIENCE=your-api-identifier  # optional
```

See [Installation](Installation.md) to set up Auth0.

### 4. Start the dev server

```bash
npm run dev
```

Frontend will run at http://localhost:5173

---

## Backend Setup

### 1. Install dependencies

```bash
cd server
npm install
```

### 2. Create environment file

```bash
cp .env.example .env
```

### 3. Edit `.env`

```bash
PORT=3000
NODE_ENV=development
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AUTH0_AUDIENCE=your-api-identifier  # optional
PUBLIC_FRONTEND_URL=http://localhost:5173
```

### 4. Start the dev server

```bash
npm run dev
```

Backend will run at http://localhost:3000

---

## Database

SQLite database is stored in `server/data/app.db` and persists between runs.

To reset the database, delete the file:

```bash
rm server/data/app.db
```

---

See [Environment Variables](Environment-Variables.md) for all available variables.
