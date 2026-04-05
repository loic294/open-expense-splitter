# Architecture

## Project Structure

```
open-expense-splitter/
├── client/                 # React 18 + Vite frontend
│   ├── src/
│   │   ├── App.tsx                    # Router & provider setup only
│   │   ├── Auth0Provider.tsx          # Auth0 context wrapper
│   │   ├── api.ts                     # API client with auth
│   │   ├── types.ts                   # TypeScript type definitions
│   │   ├── index.css                  # Global styles
│   │   ├── main.tsx                   # React entry point
│   │   ├── components/                # Reusable UI components
│   │   │   ├── AppShell.tsx          # Main layout wrapper
│   │   │   ├── AuthGuard.tsx         # Protected route wrapper
│   │   │   └── ...                    # Other UI components
│   │   ├── pages/                     # Page components (one per route)
│   │   │   ├── HomeRedirectPage.tsx
│   │   │   ├── LoginPage.tsx
│   │   │   ├── ProfilePage.tsx
│   │   │   ├── GroupDashboardPage.tsx
│   │   │   └── ...
│   │   ├── context/                   # React Context for state
│   │   │   ├── AppDataContext.tsx    # Shared app data
│   │   │   └── NavbarActionsContext.tsx
│   │   └── utils/                     # Utility functions
│   │       ├── csvImport.ts
│   │       └── spending.ts
│   ├── package.json
│   ├── vite.config.ts                 # Vite configuration
│   ├── wrangler.toml                  # Cloudflare Pages config
│   ├── Dockerfile                     # Docker image for frontend
│   └── .env.example
├── server/                 # Node.js + Hono backend
│   ├── src/
│   │   ├── index.ts                   # Node.js/Docker entry point (2500+ lines)
│   │   ├── worker.ts                  # Cloudflare Workers entry point (1800+ lines)
│   │   ├── db.ts                      # SQLite database setup & queries
│   │   ├── auth.ts                    # Auth0 JWT verification middleware
│   │   └── ...                        # Other utilities
│   ├── migrations/                    # D1 database migrations for Cloudflare
│   │   └── 0001_initial.sql         # Schema and seed data
│   ├── data/                          # SQLite database (Docker volume)
│   │   └── app.db                   # Persistent database file
│   ├── package.json
│   ├── wrangler.toml                  # Cloudflare Workers config
│   ├── Dockerfile                     # Docker image for backend
│   └── .env.example
├── .github/
│   ├── workflows/                     # GitHub Actions
│   │   ├── publish-docker.yml        # Publish Docker images to GHCR
│   │   └── deploy-cloudflare.yml     # Deploy to Cloudflare
│   └── wiki/                          # GitHub wiki pages
│       ├── Quick-Start.md
│       ├── Installation.md
│       └── ...
├── docker-compose.yml                 # Local Docker development
├── .env.example                       # Environment variables template
├── package.json                       # Root workspace config (npm workspaces)
└── README.md                          # Project overview
```

---

## Frontend Architecture Principles

### 1. Thin App.tsx

`App.tsx` is a composition root only:

```tsx
export default function App() {
  return (
    <Auth0Provider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <AuthGuard>
                <ProtectedAppLayout />
              </AuthGuard>
            }
          >
            <Route path="/dashboard" element={<GroupDashboardPage />} />
            ...
          </Route>
        </Routes>
      </Router>
    </Auth0Provider>
  );
}
```

**What NOT in App.tsx:**

- Feature state
- Data fetching
- Business logic
- Page-specific handlers

### 2. Page Components

Each route has a dedicated page in `src/pages/`:

- `LoginPage.tsx` - Login flow
- `ProfilePage.tsx` - User profile
- `GroupDashboardPage.tsx` - Group overview
- `GroupCreatePage.tsx` - Create group form
- `GroupEditPage.tsx` - Edit group form
- etc.

Pages own their layout, state, and data fetching for that route.

### 3. Reusable Components

Shared UI components in `src/components/`:

- `AuthGuard.tsx` - Wraps protected routes
- `GroupFormCard.tsx` - Reusable form for creating/editing groups
- `GroupSummaryCard.tsx` - Group summary display
- `TransactionSection.tsx` - Transaction list display
- etc.

Components receive data via props and emit events via callbacks.

### 4. Context for Shared State

React Context in `src/context/`:

- `AppDataContext.tsx` - User profile, groups, cached data
- `NavbarActionsContext.tsx` - Navbar action buttons

Context is used for:

- Avoiding prop drilling
- Sharing computed state
- Caching API responses

**NOT used for:**

- Page-specific form state (use useState in page components)
- Complex state that changes frequently (would cause unnecessary re-renders)

---

## Backend Architecture

### Node.js Entry Point (`src/index.ts`)

2500+ lines of Hono application with:

- 29 REST endpoints for all features
- SQLite database with better-sqlite3
- Auth0 JWT verification middleware
- CORS configuration
- Request logging
- Database initialization on startup

### Cloudflare Workers Entry Point (`src/worker.ts`)

1800+ lines of self-contained Hono application with:

- All 29 endpoints ported to async patterns
- Cloudflare D1 database (serverless SQLite)
- JWT verification using Web Crypto (jose library)
- Async database operations
- Environment variable and secret bindings

Both entry points share:

- Same Hono routing logic
- Same business logic (with async/sync adaptations)
- Same Auth0 JWT verification concept

### Database Layer (`src/db.ts`)

Database setup and schema:

- SQLite schema definition
- Database initialization
- Connection pooling (for Node.js)

Separate async versions for D1 (Cloudflare).

### Authentication (`src/auth.ts`)

Auth0 JWT verification middleware:

- JWKS (JSON Web Key Set) caching
- Token validation
- Audience validation (optional)
- User ID extraction

---

## Tech Stack Details

### Frontend

| Technology             | Purpose                 |
| ---------------------- | ----------------------- |
| React 18               | UI framework            |
| Vite                   | Build tool & dev server |
| TypeScript             | Type safety             |
| Auth0 SDK              | Authentication          |
| React Router           | Client-side routing     |
| Tailwind CSS + daisyUI | Styling                 |

### Backend (Node.js)

| Technology              | Purpose          |
| ----------------------- | ---------------- |
| Node.js                 | Runtime          |
| Hono                    | Web framework    |
| SQLite + better-sqlite3 | Database         |
| jose                    | JWT verification |

### Cloudflare

| Technology         | Purpose             |
| ------------------ | ------------------- |
| Cloudflare Workers | Serverless compute  |
| Cloudflare D1      | Serverless SQLite   |
| Cloudflare Pages   | Static site hosting |
| Wrangler           | Cloudflare CLI      |

---

## Data Flow

### Authentication Flow

1. User logs in with Auth0
2. Frontend receives Auth0 access token
3. Frontend attaches token to every API request in `Authorization` header
4. Backend verifies JWT with Auth0 JWKS
5. Backend extracts user ID from token claims
6. Backend filters all queries by user ID for isolation

### API Request Flow

1. Frontend calls `api.ts` functions
2. `api.ts` adds Auth0 token to request headers
3. Request reaches backend Hono middleware
4. Middleware verifies JWT
5. Route handler processes request with verified user ID
6. Database query filtered by user ID
7. Response returned to frontend

### State Management

- **Global state**: Auth0 user, cache via Context
- **Page state**: Form inputs, UI flags via useState
- **API calls**: Fetch via React hooks (useEffect)
- **Mutations**: POST/PUT/DELETE via button handlers

---

See [API Reference](API-Reference.md) and [Database Schema](Database-Schema.md) for implementation details.
