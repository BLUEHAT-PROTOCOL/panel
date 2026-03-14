# CyberPanel - Project Summary

## Overview
CyberPanel is a modern, fullstack hosting control panel built with Node.js, React, and PostgreSQL. It features real-time monitoring, web terminal, file manager, and a complete billing system.

## Project Structure

```
hosting-panel/
├── backend/                    # Node.js Express API
│   ├── src/
│   │   ├── controllers/        # Route controllers
│   │   │   ├── authController.js
│   │   │   ├── userController.js
│   │   │   ├── adminController.js
│   │   │   ├── hostingController.js
│   │   │   ├── billingController.js
│   │   │   ├── fileManagerController.js
│   │   │   ├── terminalController.js
│   │   │   └── apiController.js
│   │   ├── middleware/         # Express middleware
│   │   │   ├── auth.js
│   │   │   ├── apiAuth.js
│   │   │   └── errorHandler.js
│   │   ├── models/             # (Prisma schema)
│   │   ├── routes/             # API routes
│   │   │   ├── auth.js
│   │   │   ├── users.js
│   │   │   ├── admin.js
│   │   │   ├── hosting.js
│   │   │   ├── billing.js
│   │   │   ├── fileManager.js
│   │   │   ├── terminal.js
│   │   │   └── api.js
│   │   ├── services/           # Business logic
│   │   │   └── socketService.js
│   │   ├── utils/              # Utilities
│   │   │   ├── logger.js
│   │   │   └── seed.js
│   │   └── server.js           # Main entry point
│   ├── prisma/
│   │   └── schema.prisma       # Database schema
│   ├── Dockerfile
│   ├── railway.json
│   ├── package.json
│   └── .env.example
│
├── frontend/                   # React + Vite + Tailwind
│   ├── src/
│   │   ├── components/         # Reusable components
│   │   │   ├── Sidebar.tsx
│   │   │   ├── AdminSidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   ├── AdminHeader.tsx
│   │   │   ├── ProtectedRoute.tsx
│   │   │   └── AdminRoute.tsx
│   │   ├── context/            # React contexts
│   │   │   ├── AuthContext.tsx
│   │   │   ├── SocketContext.tsx
│   │   │   └── ThemeContext.tsx
│   │   ├── layouts/            # Page layouts
│   │   │   ├── MainLayout.tsx
│   │   │   ├── AdminLayout.tsx
│   │   │   └── AuthLayout.tsx
│   │   ├── lib/                # Utilities & API
│   │   │   ├── api.ts
│   │   │   └── utils.ts
│   │   ├── pages/              # Page components
│   │   │   ├── auth/
│   │   │   │   ├── Login.tsx
│   │   │   │   ├── Register.tsx
│   │   │   │   ├── ForgotPassword.tsx
│   │   │   │   └── ResetPassword.tsx
│   │   │   ├── user/
│   │   │   │   ├── Dashboard.tsx
│   │   │   │   ├── Profile.tsx
│   │   │   │   ├── Hostings.tsx
│   │   │   │   ├── HostingDetail.tsx
│   │   │   │   ├── Databases.tsx
│   │   │   │   ├── Domains.tsx
│   │   │   │   ├── Invoices.tsx
│   │   │   │   ├── ApiKeys.tsx
│   │   │   │   ├── FileManager.tsx
│   │   │   │   └── Terminal.tsx
│   │   │   └── admin/
│   │   │       ├── Dashboard.tsx
│   │   │       ├── Users.tsx
│   │   │       ├── UserDetail.tsx
│   │   │       ├── Hostings.tsx
│   │   │       ├── HostingDetail.tsx
│   │   │       ├── Servers.tsx
│   │   │       ├── Packages.tsx
│   │   │       ├── Invoices.tsx
│   │   │       ├── ActivityLogs.tsx
│   │   │       └── Settings.tsx
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── .env.example
│
├── docker/
│   └── docker-compose.yml      # Docker Compose configuration
│
├── scripts/
│   ├── install.sh              # Installation script
│   └── start.sh                # Start development servers
│
├── README.md
├── LICENSE
└── .gitignore
```

## Key Features Implemented

### Authentication System
- JWT-based authentication with refresh tokens
- 2FA (Two-Factor Authentication) with TOTP
- Password reset via email
- Role-based access control (Admin, User, Reseller)

### User Panel
- Dashboard with resource monitoring
- Hosting management (create, start, stop, restart)
- Database management
- Domain management
- File manager (upload, download, edit)
- Web terminal (browser-based SSH)
- Billing and invoices
- API key management

### Admin Panel
- Dashboard with analytics
- User management (CRUD, suspend, reset password)
- Hosting management (all users)
- Server management
- Package management
- Activity logs
- System settings
- Broadcast notifications

### Real-time Features
- WebSocket-based live updates
- Resource monitoring (CPU, RAM, Disk, Network)
- Server status monitoring
- Live notifications
- Terminal streaming

### Security Features
- Helmet.js for security headers
- Rate limiting
- CORS protection
- Input validation
- bcrypt password hashing
- SQL injection prevention (Prisma)

### Technical Stack

#### Backend
- Node.js 20+
- Express.js
- Prisma ORM
- PostgreSQL 16+
- Socket.io
- JWT (jsonwebtoken)
- bcryptjs
- Winston (logging)

#### Frontend
- React 18
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui components
- React Query
- React Router
- Socket.io-client
- Recharts (charts)
- Axios

#### DevOps
- Docker & Docker Compose
- Railway deployment ready
- Nginx reverse proxy
- Health checks

## Database Schema

### Tables
- `users` - User accounts
- `api_keys` - API keys for automation
- `hostings` - Hosting services
- `packages` - Hosting packages/plans
- `servers` - Physical/virtual servers
- `databases` - User databases
- `domains` - User domains
- `invoices` - Billing invoices
- `transactions` - Payment transactions
- `activity_logs` - System activity logs
- `notifications` - User notifications
- `settings` - System settings

## API Endpoints

### Public
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password/:token`
- `GET /health`

### Protected (User)
- `GET /api/auth/me`
- `PUT /api/auth/me`
- `GET /api/users/dashboard`
- `GET /api/hosting`
- `POST /api/hosting/order`
- `GET /api/billing/invoices`

### Protected (Admin)
- `GET /api/admin/dashboard`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `GET /api/admin/hostings`
- `GET /api/admin/servers`
- `GET /api/admin/logs`

### API Key Protected
- `GET /api/v1/me`
- `GET /api/v1/hostings`
- `POST /api/v1/hostings`

## Installation

### Quick Start
```bash
# Run installation script
chmod +x scripts/install.sh
./scripts/install.sh

# Or start both servers
chmod +x scripts/start.sh
./scripts/start.sh
```

### Docker
```bash
cd docker
docker-compose up -d
```

## Default Credentials

| Role  | Email                    | Password  |
|-------|--------------------------|-----------|
| Admin | admin@cyberpanel.local   | admin123  |
| User  | user@example.com         | user123   |

## Environment Variables

### Backend
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT signing secret
- `JWT_REFRESH_SECRET` - Refresh token secret
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `FRONTEND_URL` - Frontend URL for CORS

### Frontend
- `VITE_API_URL` - Backend API URL
- `VITE_WS_URL` - WebSocket URL

## Deployment

### Railway
1. Connect GitHub repository
2. Add PostgreSQL database
3. Set environment variables
4. Deploy

### Docker
```bash
docker build -t cyberpanel-backend ./backend
docker build -t cyberpanel-frontend ./frontend
docker-compose up -d
```

## Future Enhancements
- Email service integration
- Backup/restore functionality
- SSL certificate management
- DNS management
- More payment gateways
- Multi-language support
- Mobile app

---

Built with ❤️ using Node.js, React, and PostgreSQL.