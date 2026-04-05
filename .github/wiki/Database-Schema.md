# Database Schema

SQLite database with the following tables:

## users

Stores user profiles synced from Auth0.

| Column       | Type | Notes                 |
| ------------ | ---- | --------------------- |
| `id`         | TEXT | Primary key (UUID)    |
| `auth0_id`   | TEXT | Auth0 user ID, unique |
| `email`      | TEXT | User email, unique    |
| `name`       | TEXT | Display name          |
| `picture`    | TEXT | Profile picture URL   |
| `created_at` | TEXT | ISO 8601 timestamp    |
| `updated_at` | TEXT | ISO 8601 timestamp    |

---

## spendings

Individual spending records.

| Column        | Type | Notes                                      |
| ------------- | ---- | ------------------------------------------ |
| `id`          | TEXT | Primary key (UUID)                         |
| `user_id`     | TEXT | FK → users.id                              |
| `description` | TEXT | What was purchased                         |
| `amount`      | REAL | Amount in currency units                   |
| `category`    | TEXT | e.g., "food", "transport", "accommodation" |
| `date`        | TEXT | Date in YYYY-MM-DD format                  |
| `created_at`  | TEXT | ISO 8601 timestamp                         |

---

## batches

Groups for splitting expenses.

| Column        | Type | Notes              |
| ------------- | ---- | ------------------ |
| `id`          | TEXT | Primary key (UUID) |
| `owner_id`    | TEXT | FK → users.id      |
| `name`        | TEXT | Group name         |
| `description` | TEXT | Group description  |
| `created_at`  | TEXT | ISO 8601 timestamp |
| `updated_at`  | TEXT | ISO 8601 timestamp |

---

## batch_members

Participants in a group.

| Column       | Type | Notes              |
| ------------ | ---- | ------------------ |
| `id`         | TEXT | Primary key (UUID) |
| `batch_id`   | TEXT | FK → batches.id    |
| `user_id`    | TEXT | FK → users.id      |
| `created_at` | TEXT | ISO 8601 timestamp |

**Constraint:** (batch_id, user_id) unique pair

---

## batch_items

Individual items/transactions in a batch.

| Column        | Type | Notes                     |
| ------------- | ---- | ------------------------- |
| `id`          | TEXT | Primary key (UUID)        |
| `batch_id`    | TEXT | FK → batches.id           |
| `spending_id` | TEXT | FK → spendings.id         |
| `paid_by_id`  | TEXT | FK → users.id (who paid)  |
| `amount`      | REAL | Amount paid for this item |
| `description` | TEXT | Item description          |
| `created_at`  | TEXT | ISO 8601 timestamp        |

---

## currency_preferences

User's preferred currency.

| Column       | Type | Notes                              |
| ------------ | ---- | ---------------------------------- |
| `id`         | TEXT | Primary key (UUID)                 |
| `user_id`    | TEXT | FK → users.id, unique              |
| `currency`   | TEXT | Currency code (e.g., "USD", "EUR") |
| `created_at` | TEXT | ISO 8601 timestamp                 |
| `updated_at` | TEXT | ISO 8601 timestamp                 |

---

## invites

Group invitation codes.

| Column       | Type | Notes                  |
| ------------ | ---- | ---------------------- |
| `id`         | TEXT | Primary key (UUID)     |
| `batch_id`   | TEXT | FK → batches.id        |
| `code`       | TEXT | Unique invitation code |
| `created_at` | TEXT | ISO 8601 timestamp     |
| `expires_at` | TEXT | ISO 8601 timestamp     |

---

## Data Integrity

- **Foreign Keys**: Enforced (ON DELETE CASCADE for referential integrity)
- **User Isolation**: All queries filtered by authenticated user ID
- **Timestamps**: All timestamps stored as ISO 8601 strings (UTC)

---

See [API Reference](API-Reference.md) for endpoint details.
