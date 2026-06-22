# Firewall Lab Dashboard

A full-stack dashboard for managing firewall lab device reservations.

## Stack

- Frontend: React
- Backend: Node.js, Express
- Database: PostgreSQL
- Environment config: `.env` files loaded by `dotenv`

## Features

- View firewall devices by team, section, availability, owner, and location
- Reserve devices for custom durations
- Release active reservations
- Admin device management
- Inventory summary
- Optional ping support per device
- Optional seed data through `SEED_DATA=true`

## Project Structure

```text
client/   React frontend
server/   Express API and PostgreSQL database setup
```

## Backend Setup

Create a local environment file from the example:

```bash
cp server/.env.example server/.env
```

Set the required PostgreSQL connection string:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/firewall_dashboard
PORT=5001
FRONTEND_URL=http://localhost:3000
ADMIN_CODE=admin123
SEED_DATA=false
```

`DATABASE_URL` is required. The server will not start without it.

Install and run the backend:

```bash
cd server
npm install
npm start
```

The API runs on `http://localhost:5001` by default.

## Frontend Setup

Install and run the frontend:

```bash
cd client
npm install
npm start
```

For local development, the frontend expects the API at `http://localhost:5001`.

## Database

The backend creates these PostgreSQL tables automatically on startup if they do not exist:

- `devices`
- `reservations`
- `device_status`
- `inventory`

To start with sample devices, set:

```env
SEED_DATA=true
```

For production, the recommended value is:

```env
SEED_DATA=false
```

Then add devices through the admin UI.

## Deployment Notes

Set these backend environment variables on the host:

```env
DATABASE_URL=postgresql://...
PORT=5001
NODE_ENV=production
FRONTEND_URL=https://your-frontend-domain
ADMIN_CODE=your-secure-admin-code
SEED_DATA=false
```

For the frontend build, set:

```env
REACT_APP_API_URL=https://your-backend-domain
```

Build the frontend with:

```bash
cd client
npm install
npm run build
```

Serve `client/build` with your web server and run the backend with Node or a process manager such as PM2.
