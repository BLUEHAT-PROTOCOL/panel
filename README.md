# CyberPanel - Modern Hosting Control Panel

A fullstack hosting panel application built with Node.js, React, and PostgreSQL. Features real-time monitoring, web terminal, file manager, and billing system.

![CyberPanel](https://img.shields.io/badge/CyberPanel-v1.0.0-blue)
![Node.js](https://img.shields.io/badge/Node.js-20+-green)
![React](https://img.shields.io/badge/React-18+-61DAFB)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-336791)

## Features

### User Features
- **Authentication**: JWT-based auth with 2FA support
- **Dashboard**: Real-time resource monitoring
- **Hosting Management**: Create, start, stop, restart hosting services
- **File Manager**: Upload, download, edit files
- **Web Terminal**: Browser-based SSH terminal
- **Database Manager**: Create and manage databases
- **Domain Management**: Add and manage domains
- **Billing**: Invoice management and payment tracking
- **API Keys**: Generate API keys for automation

### Admin Features
- **User Management**: Create, edit, suspend, delete users
- **Hosting Management**: Manage all hosting accounts
- **Server Management**: Monitor and manage servers
- **Package Management**: Create hosting packages
- **Activity Logs**: Track all system activities
- **Analytics**: View platform statistics
- **Billing Management**: Manage invoices and transactions
- **System Settings**: Configure platform settings

### Technical Features
- **Real-time**: WebSocket-based live updates
- **Security**: Helmet, rate limiting, CORS protection
- **Responsive**: Mobile-friendly design
- **Dark Theme**: Modern cyber UI with glassmorphism
- **Docker**: Containerized deployment
- **Railway Ready**: One-click deployment to Railway

## Project Structure

```
hosting-panel/
├── backend/              # Node.js Express API
│   ├── src/
│   │   ├── controllers/  # Route controllers
│   │   ├── middleware/   # Auth, error handling
│   │   ├── models/       # Database models
│   │   ├── routes/       # API routes
│   │   ├── services/     # Socket.io, etc.
│   │   └── utils/        # Logger, seed
│   ├── prisma/           # Database schema
│   ├── Dockerfile
│   └── package.json
├── frontend/             # React + Vite + Tailwind
│   ├── src/
│   │   ├── components/   # Reusable components
│   │   ├── context/      # React contexts
│   │   ├── layouts/      # Page layouts
│   │   ├── lib/          # API client, utils
│   │   └── pages/        # Page components
│   ├── Dockerfile
│   └── package.json
├── docker/               # Docker Compose files
└── scripts/              # Installation scripts
```

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- Redis (optional, for caching)

### Local Development

1. **Clone the repository**
```bash
git clone <repository-url>
cd hosting-panel
```

2. **Setup Backend**
```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npx prisma generate
npm run seed
npm run dev
```

3. **Setup Frontend**
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

4. **Access the application**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

### Default Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@cyberpanel.local | admin123 |
| User | user@example.com | user123 |

## Docker Deployment

### Using Docker Compose

```bash
cd docker
docker-compose up -d
```

This will start:
- Backend API (port 3000)
- Frontend (port 80)
- PostgreSQL (port 5432)
- Redis (port 6379)
- pgAdmin (port 5050)

### Environment Variables

#### Backend (.env)
```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/cyberpanel?schema=public"

# JWT
JWT_SECRET="your-super-secret-jwt-key"
JWT_REFRESH_SECRET="your-refresh-secret-key"
JWT_EXPIRES_IN="24h"

# Server
PORT=3000
NODE_ENV="production"
FRONTEND_URL="http://localhost:5173"

# 2FA
TOTP_SERVICE_NAME="CyberPanel"
```

#### Frontend (.env)
```env
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
```

## Railway Deployment

### One-Click Deploy

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/your-template)

### Manual Deploy

1. **Create a new project on Railway**

2. **Add PostgreSQL database**
   - Go to "New" → "Database" → "Add PostgreSQL"

3. **Deploy Backend**
   - Go to "New" → "GitHub Repo"
   - Select your repository
   - Set root directory to `backend`
   - Add environment variables

4. **Deploy Frontend**
   - Go to "New" → "GitHub Repo"
   - Select your repository
   - Set root directory to `frontend`
   - Set `VITE_API_URL` to your backend URL

## API Documentation

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login user |
| POST | `/api/auth/logout` | Logout user |
| POST | `/api/auth/refresh` | Refresh token |
| GET | `/api/auth/me` | Get current user |

### User Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/dashboard` | Get user dashboard |
| GET | `/api/users/api-keys` | List API keys |
| POST | `/api/users/api-keys` | Create API key |

### Hosting Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/hosting` | List my hostings |
| POST | `/api/hosting/order` | Order new hosting |
| GET | `/api/hosting/:id` | Get hosting details |
| PATCH | `/api/hosting/:id/start` | Start hosting |
| PATCH | `/api/hosting/:id/stop` | Stop hosting |
| PATCH | `/api/hosting/:id/restart` | Restart hosting |

### Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/dashboard` | Get admin stats |
| GET | `/api/admin/users` | List all users |
| POST | `/api/admin/users` | Create user |
| GET | `/api/admin/hostings` | List all hostings |
| GET | `/api/admin/servers` | List all servers |
| GET | `/api/admin/logs` | Get activity logs |

## WebSocket Events

### Client → Server
- `subscribe:hosting` - Subscribe to hosting updates
- `unsubscribe:hosting` - Unsubscribe from hosting
- `terminal:input` - Send terminal input

### Server → Client
- `resource:update` - Resource usage update
- `server:status` - Server status change
- `notification` - New notification
- `terminal:output` - Terminal output

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support, email support@cyberpanel.local or join our Discord server.

---

Built with ❤️ using Node.js, React, and PostgreSQL.