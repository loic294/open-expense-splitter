# Troubleshooting

## Auth0 & Login Issues

### Login Page Appears Blank

**Cause**: Auth0 environment variables not set correctly.

**Solution**:

1. Verify `.env` file has `AUTH0_DOMAIN` and `AUTH0_CLIENT_ID`
2. Check Auth0 dashboard → Applications → Settings:
   - Verify **Allowed Callback URLs** includes `http://localhost:5173`
   - Verify **Allowed Web Origins** includes `http://localhost:5173`
3. Restart services: `npm run down && npm run dev`

### "Invalid Callback URL" Error

**Cause**: Auth0 callback URL not configured.

**Solution**:

1. Go to Auth0 Dashboard → Applications → Your App → Settings
2. Set **Allowed Callback URLs** to `http://localhost:5173`
3. Click **Save**
4. Log out from Auth0 and try again

### Token Verification Fails

**Cause**: `AUTH0_CLIENT_SECRET` missing or incorrect.

**Solution**:

1. Check `server/.env` has `AUTH0_CLIENT_SECRET`
2. Verify it matches Auth0 Application Settings
3. Restart backend: `npm run down && npm run dev`

---

## Database Issues

### "Database Connection Failed"

**Cause**: SQLite database not initialized.

**Solution**:

```bash
npm run down
npm run dev
```

This recreates the database.

### Reset Database

Delete the database file and restart:

```bash
# Docker
docker volume rm batch-spending-splitter_db_data
npm run dev

# Local development
rm server/data/app.db
npm run dev
```

---

## Docker Issues

### Port Already in Use

**Cause**: Another service using ports 5173 or 3000.

**Solution**:

Check what's using the port:

```bash
# macOS
lsof -i :5173
lsof -i :3000

# Linux
netstat -tuln | grep 5173
```

Kill the process or change port in `docker-compose.yml`:

```yaml
ports:
  - "5174:5173" # Use 5174 instead
```

Then restart:

```bash
npm run down
npm run dev
```

### "Cannot connect to Docker daemon"

**Cause**: Docker not running.

**Solution**:

- macOS: Start Docker Desktop
- Linux: `sudo systemctl start docker`

### Images Not Pulling

**Cause**: Network issue or image not found.

**Solution**:

```bash
docker compose pull
npm run down
npm run dev
```

---

## Local Development Issues

### "Module Not Found"

**Cause**: Dependencies not installed.

**Solution**:

```bash
cd client && npm install
cd server && npm install
cd ..
npm run dev
```

### Port Already in Use

**Cause**: Previous process still running.

**Solution**:

Kill processes:

```bash
# macOS/Linux
kill -9 $(lsof -t -i :5173)
kill -9 $(lsof -t -i :3000)

# Or restart terminal
```

### Hot Reload Not Working

**Cause**: File watcher issue.

**Solution**:

1. Stop dev server (Ctrl+C)
2. Clear cache: `rm -rf node_modules/.vite`
3. Restart: `npm run dev`

---

## API Issues

### "Unauthorized" (401) Response

**Cause**: Missing or invalid Auth0 token.

**Solution**:

1. Log out completely from app
2. Close browser tab
3. Log back in
4. If persists, check `AUTH0_DOMAIN` and `AUTH0_CLIENT_ID`

### CORS Error in Console

**Cause**: Backend CORS not configured for frontend URL.

**Solution**:

1. If using production URL, set `PUBLIC_FRONTEND_URL` in root `.env`
2. Restart backend: `npm run down && npm run dev`
3. Check backend logs for CORS issues

### Empty Data Lists

**Cause**: Data is user-isolated; you're logged in as different user.

**Solution**:

1. Add data via app UI
2. Or reset database: `docker volume rm batch-spending-splitter_db_data`

---

## Cloudflare Issues

### D1 Database Not Found

**Cause**: Database ID not in `server/wrangler.toml`.

**Solution**:

1. Check database exists:

```bash
npx wrangler d1 list
```

2. Update `server/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "batch-spending-splitter"
database_id = "YOUR-DATABASE-ID"
```

### Migration Fails

**Cause**: Schema already applied or syntax error.

**Solution**:

Check current migrations:

```bash
npx wrangler d1 migrations list batch-spending-splitter --remote
```

If migration is already applied, it won't run again (safe).

---

## Performance Issues

### Slow API Responses

**Cause**: Large data set or missing database indexes.

**Solution**:

1. Check backend logs for slow queries
2. Ensure you're filtering by user (already done)
3. Restart backend: `npm run down && npm run dev`

### High Memory Usage

**Cause**: Memory leak or large file operation.

**Solution**:

1. Restart services: `npm run down && npm run dev`
2. Check if importing large CSV file
3. Monitor: `docker stats`

---

## File Upload Issues

### CSV Import Fails

**Cause**: Incorrect CSV format.

**Solution**:

CSV must have these columns:

- `description`
- `amount`
- `category`
- `date` (YYYY-MM-DD format)

Example:

```
description,amount,category,date
Lunch,15.50,food,2024-01-01
Coffee,5.00,beverage,2024-01-02
```

---

## Still Having Issues?

1. Check logs: `npm run dev` output
2. Check browser dev tools (F12)
3. Check backend logs for errors
4. Verify all environment variables are set
5. Reset and try again: `npm run down && npm run dev`

---

See [Installation](Installation.md) for setup help or [Architecture](Architecture.md) for technical details.
