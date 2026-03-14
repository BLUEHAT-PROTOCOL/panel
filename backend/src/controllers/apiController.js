const { PrismaClient } = require('@prisma/client');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const prisma = new PrismaClient();

// User info
exports.getUserInfo = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      createdAt: true,
      _count: {
        select: {
          hostings: true
        }
      }
    }
  });

  res.json({
    status: 'success',
    data: { user }
  });
});

// List hostings
exports.listHostings = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = { userId: req.user.id };
  if (status) where.status = status;

  const [hostings, total] = await Promise.all([
    prisma.hosting.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        package: {
          select: {
            name: true,
            cpuLimit: true,
            ramLimit: true,
            diskLimit: true
          }
        },
        server: {
          select: {
            name: true,
            hostname: true,
            ipAddress: true,
            status: true
          }
        },
        _count: {
          select: {
            databases: true,
            domains: true
          }
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

// Create hosting
exports.createHosting = asyncHandler(async (req, res) => {
  const { name, packageId, description } = req.body;

  if (!name || !packageId) {
    throw new AppError('Name and packageId are required', 400, 'MISSING_PARAMS');
  }

  // Check package
  const package = await prisma.package.findUnique({
    where: { id: packageId }
  });

  if (!package) {
    throw new AppError('Package not found', 404, 'PACKAGE_NOT_FOUND');
  }

  // Find available server
  const server = await prisma.server.findFirst({
    where: { status: 'ONLINE' }
  });

  if (!server) {
    throw new AppError('No servers available', 503, 'NO_SERVERS_AVAILABLE');
  }

  const hosting = await prisma.hosting.create({
    data: {
      name,
      description,
      userId: req.user.id,
      packageId,
      serverId: server.id,
      status: 'PENDING'
    },
    include: {
      package: {
        select: {
          name: true,
          cpuLimit: true,
          ramLimit: true,
          diskLimit: true
        }
      },
      server: {
        select: {
          name: true,
          hostname: true,
          ipAddress: true
        }
      }
    }
  });

  logger.info(`API: User ${req.user.username} created hosting: ${name}`);

  res.status(201).json({
    status: 'success',
    message: 'Hosting created successfully',
    data: { hosting }
  });
});

// Get hosting details
exports.getHosting = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const hosting = await prisma.hosting.findFirst({
    where: {
      id,
      userId: req.user.id
    },
    include: {
      package: true,
      server: {
        select: {
          name: true,
          hostname: true,
          ipAddress: true,
          status: true
        }
      },
      databases: true,
      domains: true
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

// Update hosting status
exports.updateHostingStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const hosting = await prisma.hosting.findFirst({
    where: { id, userId: req.user.id }
  });

  if (!hosting) {
    throw new AppError('Hosting not found', 404, 'HOSTING_NOT_FOUND');
  }

  await prisma.hosting.update({
    where: { id },
    data: { status }
  });

  logger.info(`API: User ${req.user.username} updated hosting ${hosting.name} status to ${status}`);

  res.json({
    status: 'success',
    message: 'Hosting status updated'
  });
});

// Delete hosting
exports.deleteHosting = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const hosting = await prisma.hosting.findFirst({
    where: { id, userId: req.user.id }
  });

  if (!hosting) {
    throw new AppError('Hosting not found', 404, 'HOSTING_NOT_FOUND');
  }

  await prisma.hosting.delete({ where: { id } });

  logger.info(`API: User ${req.user.username} deleted hosting: ${hosting.name}`);

  res.json({
    status: 'success',
    message: 'Hosting deleted successfully'
  });
});

// Start hosting
exports.startHosting = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const hosting = await prisma.hosting.findFirst({
    where: { id, userId: req.user.id }
  });

  if (!hosting) {
    throw new AppError('Hosting not found', 404, 'HOSTING_NOT_FOUND');
  }

  await prisma.hosting.update({
    where: { id },
    data: { status: 'ACTIVE' }
  });

  logger.info(`API: User ${req.user.username} started hosting: ${hosting.name}`);

  res.json({
    status: 'success',
    message: 'Hosting started successfully'
  });
});

// Stop hosting
exports.stopHosting = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const hosting = await prisma.hosting.findFirst({
    where: { id, userId: req.user.id }
  });

  if (!hosting) {
    throw new AppError('Hosting not found', 404, 'HOSTING_NOT_FOUND');
  }

  await prisma.hosting.update({
    where: { id },
    data: { status: 'PENDING' }
  });

  logger.info(`API: User ${req.user.username} stopped hosting: ${hosting.name}`);

  res.json({
    status: 'success',
    message: 'Hosting stopped successfully'
  });
});

// Restart hosting
exports.restartHosting = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const hosting = await prisma.hosting.findFirst({
    where: { id, userId: req.user.id }
  });

  if (!hosting) {
    throw new AppError('Hosting not found', 404, 'HOSTING_NOT_FOUND');
  }

  logger.info(`API: User ${req.user.username} restarted hosting: ${hosting.name}`);

  res.json({
    status: 'success',
    message: 'Hosting restarted successfully'
  });
});

// Get resource usage
exports.getResourceUsage = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const hosting = await prisma.hosting.findFirst({
    where: { id, userId: req.user.id },
    include: { package: true }
  });

  if (!hosting) {
    throw new AppError('Hosting not found', 404, 'HOSTING_NOT_FOUND');
  }

  res.json({
    status: 'success',
    data: {
      current: {
        cpu: hosting.cpuUsage,
        ram: hosting.ramUsage,
        disk: hosting.diskUsage,
        networkIn: hosting.networkIn,
        networkOut: hosting.networkOut
      },
      limits: {
        cpu: hosting.package.cpuLimit * 100,
        ram: hosting.package.ramLimit,
        disk: hosting.package.diskLimit
      }
    }
  });
});