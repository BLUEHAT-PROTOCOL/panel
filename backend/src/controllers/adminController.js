const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const prisma = new PrismaClient();

// Dashboard stats
exports.getDashboardStats = asyncHandler(async (req, res) => {
  const [
    totalUsers,
    activeUsers,
    totalHostings,
    activeHostings,
    totalServers,
    onlineServers,
    pendingInvoices,
    recentActivities
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.hosting.count(),
    prisma.hosting.count({ where: { status: 'ACTIVE' } }),
    prisma.server.count(),
    prisma.server.count({ where: { status: 'ONLINE' } }),
    prisma.invoice.count({ where: { status: 'PENDING' } }),
    prisma.activityLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { username: true, email: true } }
      }
    })
  ]);

  // Calculate revenue
  const revenue = await prisma.transaction.aggregate({
    where: { status: 'COMPLETED' },
    _sum: { amount: true }
  });

  res.json({
    status: 'success',
    data: {
      users: {
        total: totalUsers,
        active: activeUsers,
        suspended: totalUsers - activeUsers
      },
      hostings: {
        total: totalHostings,
        active: activeHostings,
        suspended: totalHostings - activeHostings
      },
      servers: {
        total: totalServers,
        online: onlineServers,
        offline: totalServers - onlineServers
      },
      billing: {
        pendingInvoices,
        totalRevenue: revenue._sum.amount || 0
      },
      recentActivities
    }
  });
});

// Analytics
exports.getAnalytics = asyncHandler(async (req, res) => {
  const { period = '7d' } = req.query;

  const days = period === '30d' ? 30 : period === '90d' ? 90 : 7;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // User growth
  const userGrowth = await prisma.user.groupBy({
    by: ['createdAt'],
    where: {
      createdAt: { gte: startDate }
    },
    _count: { id: true }
  });

  // Hosting creation
  const hostingGrowth = await prisma.hosting.groupBy({
    by: ['createdAt'],
    where: {
      createdAt: { gte: startDate }
    },
    _count: { id: true }
  });

  // Revenue by day
  const revenueData = await prisma.transaction.groupBy({
    by: ['createdAt'],
    where: {
      status: 'COMPLETED',
      createdAt: { gte: startDate }
    },
    _sum: { amount: true }
  });

  res.json({
    status: 'success',
    data: {
      userGrowth,
      hostingGrowth,
      revenueData
    }
  });
});

// User Management
exports.getAllUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, role, status } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = {};
  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { username: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } }
    ];
  }
  if (role) where.role = role;
  if (status) where.status = status;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        twoFactorEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        _count: {
          select: {
            hostings: true
          }
        }
      }
    }),
    prisma.user.count({ where })
  ]);

  res.json({
    status: 'success',
    data: {
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

exports.getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      hostings: {
        include: {
          package: true,
          server: true
        }
      },
      invoices: {
        take: 10,
        orderBy: { createdAt: 'desc' }
      },
      _count: {
        select: {
          hostings: true,
          invoices: true,
          apiKeys: true
        }
      }
    }
  });

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  res.json({
    status: 'success',
    data: { user }
  });
});

exports.createUser = asyncHandler(async (req, res) => {
  const { email, username, password, firstName, lastName, role = 'USER' } = req.body;

  // Check if user exists
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { username }]
    }
  });

  if (existingUser) {
    throw new AppError('User already exists with this email or username', 400, 'USER_EXISTS');
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      username,
      password: hashedPassword,
      firstName,
      lastName,
      role
    },
    select: {
      id: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      role: true,
      status: true,
      createdAt: true
    }
  });

  // Log activity
  await prisma.activityLog.create({
    data: {
      action: 'ADMIN_CREATED_USER',
      description: `Admin created user: ${username}`,
      userId: req.user.id,
      metadata: { createdUserId: user.id }
    }
  });

  logger.info(`Admin ${req.user.username} created user: ${username}`);

  res.status(201).json({
    status: 'success',
    message: 'User created successfully',
    data: { user }
  });
});

exports.updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { firstName, lastName, email, role } = req.body;

  const user = await prisma.user.update({
    where: { id },
    data: {
      firstName,
      lastName,
      email,
      role
    },
    select: {
      id: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      role: true,
      updatedAt: true
    }
  });

  logger.info(`Admin ${req.user.username} updated user: ${user.username}`);

  res.json({
    status: 'success',
    message: 'User updated successfully',
    data: { user }
  });
});

exports.updateUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, reason } = req.body;

  if (id === req.user.id) {
    throw new AppError('Cannot change your own status', 400, 'SELF_STATUS_CHANGE');
  }

  const user = await prisma.user.update({
    where: { id },
    data: { status }
  });

  // Log activity
  await prisma.activityLog.create({
    data: {
      action: 'USER_STATUS_CHANGED',
      description: `User ${user.username} status changed to ${status}`,
      userId: req.user.id,
      metadata: { targetUserId: id, newStatus: status, reason }
    }
  });

  logger.info(`Admin ${req.user.username} changed user ${user.username} status to ${status}`);

  res.json({
    status: 'success',
    message: `User status updated to ${status}`
  });
});

exports.resetUserPassword = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.update({
    where: { id },
    data: { password: hashedPassword }
  });

  logger.info(`Admin ${req.user.username} reset password for user: ${user.username}`);

  res.json({
    status: 'success',
    message: 'Password reset successfully'
  });
});

exports.deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (id === req.user.id) {
    throw new AppError('Cannot delete your own account', 400, 'SELF_DELETE');
  }

  const user = await prisma.user.delete({
    where: { id }
  });

  logger.info(`Admin ${req.user.username} deleted user: ${user.username}`);

  res.json({
    status: 'success',
    message: 'User deleted successfully'
  });
});

// Hosting Management
exports.getAllHostings = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, status, userId } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = {};
  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }
  if (status) where.status = status;
  if (userId) where.userId = userId;

  const [hostings, total] = await Promise.all([
    prisma.hosting.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, username: true, email: true }
        },
        package: true,
        server: true,
        _count: {
          select: { databases: true, domains: true }
        }
      }
    }),
    prisma.hosting.count({ where })
  ]);

  res.json({
    status: 'success',
    data: {
      hostings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

exports.getHostingById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const hosting = await prisma.hosting.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, username: true, email: true }
      },
      package: true,
      server: true,
      databases: true,
      domains: true,
      activities: {
        take: 20,
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!hosting) {
    throw new AppError('Hosting not found', 404, 'HOSTING_NOT_FOUND');
  }

  res.json({
    status: 'success',
    data: { hosting }
  });
});

exports.createHosting = asyncHandler(async (req, res) => {
  const { name, userId, packageId, serverId, description } = req.body;

  const hosting = await prisma.hosting.create({
    data: {
      name,
      description,
      userId,
      packageId,
      serverId,
      status: 'PENDING'
    },
    include: {
      user: {
        select: { id: true, username: true, email: true }
      },
      package: true,
      server: true
    }
  });

  // Log activity
  await prisma.activityLog.create({
    data: {
      action: 'HOSTING_CREATED',
      description: `Hosting ${name} created for user ${hosting.user.username}`,
      userId: req.user.id,
      hostingId: hosting.id
    }
  });

  logger.info(`Admin ${req.user.username} created hosting: ${name}`);

  res.status(201).json({
    status: 'success',
    message: 'Hosting created successfully',
    data: { hosting }
  });
});

exports.updateHosting = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, packageId, serverId } = req.body;

  const hosting = await prisma.hosting.update({
    where: { id },
    data: {
      name,
      description,
      packageId,
      serverId
    },
    include: {
      package: true,
      server: true
    }
  });

  logger.info(`Admin ${req.user.username} updated hosting: ${hosting.name}`);

  res.json({
    status: 'success',
    message: 'Hosting updated successfully',
    data: { hosting }
  });
});

exports.updateHostingStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, reason } = req.body;

  const updateData = { status };
  if (status === 'SUSPENDED') {
    updateData.suspendedAt = new Date();
    updateData.suspendedReason = reason;
  }

  const hosting = await prisma.hosting.update({
    where: { id },
    data: updateData
  });

  // Log activity
  await prisma.activityLog.create({
    data: {
      action: 'HOSTING_STATUS_CHANGED',
      description: `Hosting ${hosting.name} status changed to ${status}`,
      userId: req.user.id,
      hostingId: id,
      metadata: { newStatus: status, reason }
    }
  });

  logger.info(`Admin ${req.user.username} changed hosting ${hosting.name} status to ${status}`);

  res.json({
    status: 'success',
    message: `Hosting status updated to ${status}`
  });
});

exports.updateHostingResources = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { cpuUsage, ramUsage, diskUsage, networkIn, networkOut } = req.body;

  const hosting = await prisma.hosting.update({
    where: { id },
    data: {
      cpuUsage,
      ramUsage,
      diskUsage,
      networkIn,
      networkOut
    }
  });

  res.json({
    status: 'success',
    message: 'Hosting resources updated',
    data: { hosting }
  });
});

exports.deleteHosting = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const hosting = await prisma.hosting.delete({
    where: { id }
  });

  logger.info(`Admin ${req.user.username} deleted hosting: ${hosting.name}`);

  res.json({
    status: 'success',
    message: 'Hosting deleted successfully'
  });
});

// Server Management
exports.getAllServers = asyncHandler(async (req, res) => {
  const servers = await prisma.server.findMany({
    include: {
      _count: {
        select: { hostings: true }
      }
    }
  });

  res.json({
    status: 'success',
    data: { servers }
  });
});

exports.getServerById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const server = await prisma.server.findUnique({
    where: { id },
    include: {
      hostings: {
        include: {
          user: { select: { username: true, email: true } },
          package: true
        }
      }
    }
  });

  if (!server) {
    throw new AppError('Server not found', 404, 'SERVER_NOT_FOUND');
  }

  res.json({
    status: 'success',
    data: { server }
  });
});

exports.createServer = asyncHandler(async (req, res) => {
  const { name, hostname, ipAddress, totalCpu, totalRam, totalDisk, sshPort, sshUser, sshKey } = req.body;

  const server = await prisma.server.create({
    data: {
      name,
      hostname,
      ipAddress,
      totalCpu,
      totalRam,
      totalDisk,
      sshPort,
      sshUser,
      sshKey,
      status: 'OFFLINE'
    }
  });

  logger.info(`Admin ${req.user.username} created server: ${name}`);

  res.status(201).json({
    status: 'success',
    message: 'Server created successfully',
    data: { server }
  });
});

exports.updateServer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const data = req.body;

  const server = await prisma.server.update({
    where: { id },
    data
  });

  logger.info(`Admin ${req.user.username} updated server: ${server.name}`);

  res.json({
    status: 'success',
    message: 'Server updated successfully',
    data: { server }
  });
});

exports.updateServerStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const server = await prisma.server.update({
    where: { id },
    data: { status }
  });

  logger.info(`Admin ${req.user.username} changed server ${server.name} status to ${status}`);

  res.json({
    status: 'success',
    message: `Server status updated to ${status}`
  });
});

exports.deleteServer = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check if server has hostings
  const server = await prisma.server.findUnique({
    where: { id },
    include: { _count: { select: { hostings: true } } }
  });

  if (server._count.hostings > 0) {
    throw new AppError('Cannot delete server with active hostings', 400, 'SERVER_HAS_HOSTINGS');
  }

  await prisma.server.delete({ where: { id } });

  logger.info(`Admin ${req.user.username} deleted server: ${server.name}`);

  res.json({
    status: 'success',
    message: 'Server deleted successfully'
  });
});

exports.pingServer = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // TODO: Implement actual server ping
  const server = await prisma.server.update({
    where: { id },
    data: {
      status: 'ONLINE',
      lastPingAt: new Date()
    }
  });

  res.json({
    status: 'success',
    message: 'Server pinged successfully',
    data: { server }
  });
});

// Package Management
exports.getAllPackages = asyncHandler(async (req, res) => {
  const packages = await prisma.package.findMany({
    orderBy: { priceMonthly: 'asc' }
  });

  res.json({
    status: 'success',
    data: { packages }
  });
});

exports.getPackageById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const package = await prisma.package.findUnique({
    where: { id },
    include: {
      _count: { select: { hostings: true } }
    }
  });

  if (!package) {
    throw new AppError('Package not found', 404, 'PACKAGE_NOT_FOUND');
  }

  res.json({
    status: 'success',
    data: { package }
  });
});

exports.createPackage = asyncHandler(async (req, res) => {
  const package = await prisma.package.create({
    data: req.body
  });

  logger.info(`Admin ${req.user.username} created package: ${package.name}`);

  res.status(201).json({
    status: 'success',
    message: 'Package created successfully',
    data: { package }
  });
});

exports.updatePackage = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const package = await prisma.package.update({
    where: { id },
    data: req.body
  });

  logger.info(`Admin ${req.user.username} updated package: ${package.name}`);

  res.json({
    status: 'success',
    message: 'Package updated successfully',
    data: { package }
  });
});

exports.deletePackage = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const package = await prisma.package.findUnique({
    where: { id },
    include: { _count: { select: { hostings: true } } }
  });

  if (package._count.hostings > 0) {
    throw new AppError('Cannot delete package with active hostings', 400, 'PACKAGE_HAS_HOSTINGS');
  }

  await prisma.package.delete({ where: { id } });

  logger.info(`Admin ${req.user.username} deleted package: ${package.name}`);

  res.json({
    status: 'success',
    message: 'Package deleted successfully'
  });
});

// Activity Logs
exports.getActivityLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, userId, action, startDate, endDate } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = {};
  if (userId) where.userId = userId;
  if (action) where.action = action;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { username: true, email: true } }
      }
    }),
    prisma.activityLog.count({ where })
  ]);

  res.json({
    status: 'success',
    data: {
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

exports.exportLogs = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const where = {};
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  const logs = await prisma.activityLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { username: true, email: true } }
    }
  });

  // Convert to CSV
  const csv = [
    'Date,User,Action,Description,IP Address',
    ...logs.map(log => 
      `"${log.createdAt.toISOString()}","${log.user?.username || 'System'}","${log.action}","${log.description || ''}","${log.ipAddress || ''}"`
    )
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=activity-logs.csv');
  res.send(csv);
});

// Settings
exports.getSettings = asyncHandler(async (req, res) => {
  const settings = await prisma.setting.findMany();

  res.json({
    status: 'success',
    data: { settings }
  });
});

exports.updateSettings = asyncHandler(async (req, res) => {
  const { settings } = req.body;

  const updates = await Promise.all(
    Object.entries(settings).map(async ([key, value]) => {
      return prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value }
      });
    })
  );

  res.json({
    status: 'success',
    message: 'Settings updated successfully',
    data: { settings: updates }
  });
});

// Broadcast notification
exports.broadcastNotification = asyncHandler(async (req, res) => {
  const { title, message, type = 'INFO', userIds } = req.body;

  let where = {};
  if (userIds && userIds.length > 0) {
    where = { id: { in: userIds } };
  }

  const users = await prisma.user.findMany({ where, select: { id: true } });

  const notifications = await Promise.all(
    users.map(user =>
      prisma.notification.create({
        data: {
          title,
          message,
          type,
          userId: user.id
        }
      })
    )
  );

  logger.info(`Admin ${req.user.username} broadcast notification to ${users.length} users`);

  res.json({
    status: 'success',
    message: `Notification sent to ${users.length} users`,
    data: { count: users.length }
  });
});