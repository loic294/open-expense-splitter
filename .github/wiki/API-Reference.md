# API Reference

## Base URLs

- **Local Development**: `http://localhost:3000`
- **Production**: Set via `PUBLIC_BACKEND_URL`

## Public Endpoints

No authentication required.

### Health Check

```
GET /api/health
```

Response:

```json
{ "status": "ok" }
```

### API Information

```
GET /
```

Response includes API details and version information.

---

## Authenticated Endpoints

All authenticated endpoints require an **Auth0 JWT token** in the `Authorization` header:

```
Authorization: Bearer <your-access-token>
```

### User Profile

```
GET /api/me
```

Returns the current authenticated user's profile.

**Response:**

```json
{
  "id": "user-id",
  "email": "user@example.com",
  "name": "User Name",
  "picture": "https://...",
  "auth0_id": "auth0|...",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

### User Login/Sync

```
POST /api/auth/login
```

Creates or updates user on login.

**Request Body:**

```json
{
  "email": "user@example.com",
  "name": "User Name",
  "picture": "https://..."
}
```

---

## Spending Endpoints

### Get User's Spendings

```
GET /api/spendings
```

Returns all spendings for the authenticated user.

**Query Parameters:**

- `limit` - Number of results (default: 50)
- `offset` - Number of results to skip (default: 0)

**Response:**

```json
[
  {
    "id": "spending-id",
    "user_id": "user-id",
    "description": "Lunch",
    "amount": 25.5,
    "category": "food",
    "date": "2024-01-01",
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

### Create Spending

```
POST /api/spendings
```

Creates a new spending record.

**Request Body:**

```json
{
  "description": "Dinner",
  "amount": 45.0,
  "category": "food",
  "date": "2024-01-01"
}
```

**Response:**

```json
{
  "id": "new-spending-id",
  "user_id": "your-user-id",
  "description": "Dinner",
  "amount": 45.0,
  "category": "food",
  "date": "2024-01-01",
  "created_at": "2024-01-01T12:00:00Z"
}
```

### Import Spendings from CSV

```
POST /api/spendings/import
```

Bulk import spendings from CSV file.

**Form Data:**

- `file` - CSV file with columns: `description, amount, category, date`

---

## Group Endpoints

### Get User's Groups

```
GET /api/groups
```

Returns all groups where the user is owner or member.

**Response:**

```json
[
  {
    "id": "group-id",
    "owner_id": "user-id",
    "name": "Trip to Paris",
    "description": "Summer vacation",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
]
```

### Create Group

```
POST /api/groups
```

Creates a new group.

**Request Body:**

```json
{
  "name": "Weekend Trip",
  "description": "Splitting costs for weekend getaway"
}
```

**Response:**

```json
{
  "id": "new-group-id",
  "owner_id": "your-user-id",
  "name": "Weekend Trip",
  "description": "Splitting costs for weekend getaway",
  "created_at": "2024-01-01T12:00:00Z",
  "updated_at": "2024-01-01T12:00:00Z"
}
```

---

## Invite Endpoints

### Get Invite Details

```
GET /api/invites/:code
```

Get details about a group invite.

**Response:**

```json
{
  "batch_id": "group-id",
  "code": "invite-code",
  "created_at": "2024-01-01T00:00:00Z",
  "expires_at": "2024-02-01T00:00:00Z"
}
```

### Accept Invite

```
POST /api/invites/:code/accept
```

Accept a group invite and join the group.

**Response:**

```json
{
  "message": "Successfully joined group",
  "batch_id": "group-id"
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "status": 400
}
```

Common HTTP status codes:

- `200` - Success
- `400` - Bad request
- `401` - Unauthorized (missing or invalid token)
- `403` - Forbidden (not permitted to access resource)
- `404` - Not found
- `500` - Server error

---

See [Database Schema](Database-Schema.md) for data structure details.
