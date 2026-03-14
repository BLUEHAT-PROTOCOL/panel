# CyberPanel - Installation Guide

This guide will walk you through installing and running CyberPanel on your local machine or deploying it to production.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Local Development](#local-development)
3. [Docker Deployment](#docker-deployment)
4. [Railway Deployment](#railway-deployment)
5. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software
- **Node.js** 20 or higher
- **PostgreSQL** 16 or higher
- **npm** or **yarn**
- **Git**

### Optional Software
- **Redis** (for caching)
- **Docker** and **Docker Compose**

---

## Local Development

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd hosting-panel
```

### Step 2: Setup the Database

1. Install PostgreSQL if not already installed:
   - **macOS**: `brew install postgresql@16`
   - **Ubuntu**: `sudo apt-get install postgresql-16`
   - **Windows**: Download from [postgresql.org](https://www.postgresql.org/download/windows/)

2. Create a database:
```bash
psql -U postgres
CREATE DATABASE cyberpanel;
\q
```

### Step 3: Configure Environment Variables

#### Backend
```bash
cd backend
cp .env.example .env
```

Edit `.env` with your database credentials:
```env
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/cyberpanel?schema=public"
JWT_SECRET="your-super-secret-jwt-key-change-this"
JWT_REFRESH_SECRET="your-refresh-secret-key-change-this"
```

#### Frontend
```bash
cd ../frontend
cp .env.example .env
```

The default frontend `.env` should work for local development:
```env
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
```

### Step 4: Install Dependencies

#### Option A: Using the Install Script (Recommended)

```bash
cd ..
chmod +x scripts/install.sh
./scripts/install.sh
```

#### Option B: Manual Installation

**Backend:**
```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run seed
```

**Frontend:**
```bash
cd ../frontend
npm install
```

### Step 5: Start the Application

#### Option A: Using the Start Script

```bash
cd ..
chmod +x scripts/start.sh
./scripts/start.sh
```

#### Option B: Manual Start

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

### Step 6: Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **API Documentation**: http://localhost:3000/health

### Default Login Credentials

| Role  | Email                    | Password  |
|-------|--------------------------|-----------|
| Admin | admin@cyberpanel.local   | admin123  |
| User  | user@example.com         | user123   |

---

## Docker Deployment

### Quick Start with Docker Compose

```bash
cd docker
docker-compose up -d
```

This will start:
- **Backend API**: http://localhost:3000
- **Frontend**: http://localhost:80
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379
- **pgAdmin**: http://localhost:5050 (admin@cyberpanel.local / admin)

### Docker Services

| Service  | Port | Description                    |
|----------|------|--------------------------------|
| app      | 3000 | Node.js backend API            |
| frontend | 80   | React frontend (Nginx)         |
| db       | 5432 | PostgreSQL database            |
| redis    | 6379 | Redis cache                    |
| pgadmin  | 5050 | PostgreSQL management UI       |

### Useful Docker Commands

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f app

# Rebuild containers
docker-compose up -d --build

# Reset everything (including data)
docker-compose down -v
```

---

## Railway Deployment

### Prerequisites
- [Railway](https://railway.app) account
- GitHub repository with your code

### Step 1: Create a New Project

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository

### Step 2: Add PostgreSQL Database

1. Click "New" → "Database" → "Add PostgreSQL"
2. Railway will automatically create the database and set the `DATABASE_URL`

### Step 3: Deploy Backend

1. Click "New" → "GitHub Repo"
2. Select your repository
3. Click "Settings" (gear icon)
4. Set **Root Directory** to `backend`
5. Add the following environment variables:

```
NODE_ENV=production
PORT=3000
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-refresh-secret-key
FRONTEND_URL=https://your-frontend-url.railway.app
```

6. Click "Deploy"

### Step 4: Deploy Frontend

1. Click "New" → "GitHub Repo"
2. Select your repository
3. Click "Settings" (gear icon)
4. Set **Root Directory** to `frontend`
5. Add environment variable:

```
VITE_API_URL=https://your-backend-url.railway.app
```

6. Click "Deploy"

### Step 5: Run Database Migrations

1. Go to your backend service
2. Click "Shell" tab
3. Run:
```bash
npx prisma migrate deploy
npm run seed
```

### Step 6: Configure Custom Domain (Optional)

1. Go to your frontend service
2. Click "Settings" → "Domains"
3. Add your custom domain

---

## Troubleshooting

### Common Issues

#### 1. Database Connection Error

**Error:** `Can't reach database server at localhost:5432`

**Solution:**
- Ensure PostgreSQL is running: `sudo service postgresql start`
- Check your `.env` DATABASE_URL
- Verify database exists: `psql -U postgres -c "\l"`

#### 2. Prisma Client Error

**Error:** `PrismaClientInitializationError`

**Solution:**
```bash
cd backend
npx prisma generate
npx prisma migrate dev
```

#### 3. Port Already in Use

**Error:** `EADDRINUSE: Address already in use :::3000`

**Solution:**
```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>
```

#### 4. CORS Error

**Error:** `CORS policy: No 'Access-Control-Allow-Origin' header`

**Solution:**
- Update backend `.env` FRONTEND_URL to match your frontend URL
- Ensure frontend VITE_API_URL matches backend URL

#### 5. WebSocket Connection Failed

**Error:** `WebSocket connection failed`

**Solution:**
- Check that backend is running
- Verify VITE_WS_URL in frontend `.env`
- For production, ensure WebSocket is enabled on your hosting platform

### Getting Help

If you encounter issues not covered here:

1. Check the logs:
   - Backend: `cd backend && npm run dev`
   - Frontend: `cd frontend && npm run dev`

2. Enable debug mode:
   - Set `LOG_LEVEL=debug` in backend `.env`

3. Create an issue on GitHub with:
   - Error message
   - Steps to reproduce
   - Environment details (OS, Node version, etc.)

---

## Next Steps

After installation:

1. **Change default passwords** - Update admin and user passwords
2. **Configure email** - Set up SMTP for password reset and notifications
3. **Create hosting packages** - Define your hosting plans
4. **Add servers** - Configure your server infrastructure
5. **Customize branding** - Update site name, logo, and colors

---

## Production Checklist

Before going live:

- [ ] Change all default passwords
- [ ] Set strong JWT secrets
- [ ] Enable HTTPS
- [ ] Configure email service
- [ ] Set up backups
- [ ] Configure monitoring
- [ ] Review security headers
- [ ] Test all features
- [ ] Set up logging
- [ ] Configure rate limiting

---

Happy hosting! 🚀