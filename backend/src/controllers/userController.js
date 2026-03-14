const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const prisma = new PrismaClient();

// Get user profile
exports.getProfile = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      avatar: true,
      role: true,
      status: true,
      twoFactorEnabled: true,
      emailVerified: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true
    }
  });

  res.json({
    status: 'success',
    data: { user }
  });
});

// Update profile
exports.updateProfile = asyncHandler(async (req, res) => {
  const { firstName, lastName, avatar } = req.body;

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: {
      firstName,
      lastName,
      avatar
    },
    select: {
      id: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      avatar: true,
      updatedAt: true
    }
  });

  logger.info(`User ${req.user.username} updated profile`);

  res.json({
    status: 'success',
    message: 'Profile updated successfully',
    data: { user }
  });
});

// API Keys
exports.getApiKeys = asyncHandler(async (req, res) => {
  const apiKeys = await prisma.apiKey.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      permissions: true,
      lastUsedAt: true,
      expiresAt: true,
      isActive: true,
      createdAt: true
    }
  });

  res.json({
    status: 'success',
    data: { apiKeys }
  });
});

exports.createApiKey = asyncHandler(async (req, res) => {
  const { name, permissions = ['read'], expiresInDays } = req.body;

  // Generate API key
  const key = `cp_${crypto.randomBytes(32).toString('hex')}`;

  const expiresAt = expiresInDays 
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const apiKey = await prisma.apiKey.create({
    data: {
      name,
      key,
      userId: req.user.id,
      permissions,
      expiresAt
    },
    select: {
      id: true,
      name: true,
      key: true,
      permissions: true,
      expiresAt: true,
      createdAt: true
    }
  });

  logger.info(`User ${req.user.username} created API key: ${name}`);

  res.status(201).json({
    status: 'success',
    message: 'API key created successfully',
    data: { apiKey }
  });
});

exports.revokeApiKey = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const apiKey = await prisma.apiKey.findFirst({
    where: { id, userId: req.user.id }
  });

  if (!apiKey) {
    throw new AppError('API key not found', 404, 'API_KEY_NOT_FOUND');
  }

  await prisma.apiKey.delete({ where: { id } });

  logger.info(`User ${req.user.username} revoked API key: ${apiKey.name}`);

  res.json({
    status: 'success',
    message: 'API key revoked successfully'
  });
});

// Notifications
exports.getNotifications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, unreadOnly = false } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = { userId: req.user.id };
  if (unreadOnly === 'true') {
    where.isRead = false;
  }

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' }
    }),
    prisma.notification.count({ where: { userId: req.user.id } }),
    prisma.notification.count({ where: { userId: req.user.id, isRead: false } })
  ]);

  res.json({
    status: 'success',
    data: {
      notifications,
      unreadCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

exports.markNotificationRead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await prisma.notification.updateMany({
    where: { id, userId: req.user.id },
    data: {
      isRead: true,
      readAt: new Date()
    }
  });

  res.json({
    status: 'success',
    message: 'Notification marked as read'
  });
});

exports.markAllNotificationsRead = asyncHandler(async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user.id, isRead: false },
    data: {
      isRead: true,
      readAt: new Date()
    }
  });

  res.json({
    status: 'success',
    message: 'All notifications marked as read'
  });
});

exports.deleteNotification = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await prisma.notification.deleteMany({
    where: { id, userId: req.user.id }
  });

  res.json({
    status: 'success',
    message: 'Notification deleted'
  });
});

// Activity
exports.getMyActivity = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [activities, total] = await Promise.all([
    prisma.activityLog.findMany({
      where: { userId: req.user.id },
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' }
    }),
    prisma.activityLog.count({ where: { userId: req.user.id } })
  ]);

  res.json({
    status: 'success',
    data: {
      activities,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

// Dashboard
exports.getDashboard = asyncHandler(async (req, res) => {
  const [
    hostings,
    invoices,
    notifications,
    recentActivity
  ] = await Promise.all([
    prisma.hosting.findMany({
      where: { userId: req.user.id },
      include: {
        package: true,
        server: { select: { name: true, status: true } },
        _count: { select: { databases: true, domains: true } }
      }
    }),
    prisma.invoice.findMany({
      where: { userId: req.user.id },
      take: 5,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.notification.findMany({
      where: { userId: req.user.id, isRead: false },
      take: 5,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.activityLog.findMany({
      where: { userId: req.user.id },
      take: 10,
      orderBy: { createdAt: 'desc' }
    })
  ]);

  // Calculate stats
  const activeHostings = hostings.filter(h => h.status === 'ACTIVE').length;
  const pendingInvoices = invoices.filter(i => i.status === 'PENDING').length;

  // Get total resource usage
  const resourceUsage = hostings.reduce((acc, h) => ({
    cpu: acc.cpu + (h.cpuUsage || 0),
    ram: acc.ram + (h.ramUsage || 0),
    disk: acc.disk + (h.diskUsage || 0)
  }), { cpu: 0, ram: 0, disk: 0 });

  res.json({
    status: 'success',
    data: {
      stats: {
        totalHostings: hostings.length,
        activeHostings,
        pendingInvoices,
        unreadNotifications: notifications.length
      },
      resourceUsage,
      hostings,
      invoices,
      notifications,
      recentActivity
    }
  });
});