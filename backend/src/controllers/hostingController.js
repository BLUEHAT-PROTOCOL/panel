const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const prisma = new PrismaClient();

// Get user's hostings
exports.getMyHostings = asyncHandler(async (req, res) => {
  const hostings = await prisma.hosting.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      package: true,
      server: {
        select: { name: true, hostname: true, status: true, ipAddress: true }
      },
      _count: {
        select: { databases: true, domains: true }
      }
    }
  });

  res.json({
    status: 'success',
    data: { hostings }
  });
});

// Get available packages
exports.getPackages = asyncHandler(async (req, res) => {
  const packages = await prisma.package.findMany({
    where: { isActive: true },
    orderBy: { priceMonthly: 'asc' }
  });

  res.json({
    status: 'success',
    data: { packages }
  });
});

// Order new hosting
exports.orderHosting = asyncHandler(async (req, res) => {
  const { packageId, name, description } = req.body;

  // Check if package exists
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
    throw new AppError('No servers available at the moment', 503, 'NO_SERVERS_AVAILABLE');
  }

  // Create hosting
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
      package: true,
      server: {
        select: { name: true, hostname: true, ipAddress: true }
      }
    }
  });

  // Log activity
  await prisma.activityLog.create({
    data: {
      action: 'HOSTING_ORDERED',
      description: `User ordered hosting: ${name}`,
      userId: req.user.id,
      hostingId: hosting.id
    }
  });

  logger.info(`User ${req.user.username} ordered hosting: ${name}`);

  res.status(201).json({
    status: 'success',
    message: 'Hosting ordered successfully',
    data: { hosting }
  });
});

// Get hosting details
exports.getHostingDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const hosting = await prisma.hosting.findFirst({
    where: {
      id,
      userId: req.user.id
    },
    include: {
      package: true,
      server: {
        select: { name: true, hostname: true, status: true, ipAddress: true }
      },
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

// Start hosting
exports.startHosting = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const hosting = await prisma.hosting.findFirst({
    where: { id, userId: req.user.id }
  });

  if (!hosting) {
    throw new AppError('Hosting not found', 404, 'HOSTING_NOT_FOUND');
  }

  if (hosting.status === 'SUSPENDED') {
    throw new AppError('Cannot start suspended hosting', 400, 'HOSTING_SUSPENDED');
  }

  // Update status
  await prisma.hosting.update({
    where: { id },
    data: { status: 'ACTIVE' }
  });

  // Log activity
  await prisma.activityLog.create({
    data: {
      action: 'HOSTING_STARTED',
      description: `Hosting ${hosting.name} started`,
      userId: req.user.id,
      hostingId: id
    }
  });

  logger.info(`User ${req.user.username} started hosting: ${hosting.name}`);

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

  // Update status
  await prisma.hosting.update({
    where: { id },
    data: { status: 'PENDING' }
  });

  // Log activity
  await prisma.activityLog.create({
    data: {
      action: 'HOSTING_STOPPED',
      description: `Hosting ${hosting.name} stopped`,
      userId: req.user.id,
      hostingId: id
    }
  });

  logger.info(`User ${req.user.username} stopped hosting: ${hosting.name}`);

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

  // Log activity
  await prisma.activityLog.create({
    data: {
      action: 'HOSTING_RESTARTED',
      description: `Hosting ${hosting.name} restarted`,
      userId: req.user.id,
      hostingId: id
    }
  });

  logger.info(`User ${req.user.username} restarted hosting: ${hosting.name}`);

  res.json({
    status: 'success',
    message: 'Hosting restarted successfully'
  });
});

// Database management
exports.getDatabases = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const hosting = await prisma.hosting.findFirst({
    where: { id, userId: req.user.id }
  });

  if (!hosting) {
    throw new AppError('Hosting not found', 404, 'HOSTING_NOT_FOUND');
  }

  const databases = await prisma.database.findMany({
    where: { hostingId: id }
  });

  res.json({
    status: 'success',
    data: { databases }
  });
});

exports.createDatabase = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  const hosting = await prisma.hosting.findFirst({
    where: { id, userId: req.user.id },
    include: {
      package: true,
      _count: { select: { databases: true } }
    }
  });

  if (!hosting) {
    throw new AppError('Hosting not found', 404, 'HOSTING_NOT_FOUND');
  }

  // Check database limit
  if (hosting._count.databases >= hosting.package.maxDatabases) {
    throw new AppError('Database limit reached for this package', 400, 'DATABASE_LIMIT_REACHED');
  }

  // Generate credentials
  const dbName = `db_${hosting.userId.slice(0, 8)}_${name}`;
  const username = `u_${crypto.randomBytes(4).toString('hex')}`;
  const password = crypto.randomBytes(16).toString('hex');

  const database = await prisma.database.create({
    data: {
      name: dbName,
      username,
      password,
      hostingId: id
    }
  });

  // Log activity
  await prisma.activityLog.create({
    data: {
      action: 'DATABASE_CREATED',
      description: `Database ${dbName} created`,
      userId: req.user.id,
      hostingId: id
    }
  });

  logger.info(`User ${req.user.username} created database: ${dbName}`);

  res.status(201).json({
    status: 'success',
    message: 'Database created successfully',
    data: { database }
  });
});

exports.deleteDatabase = asyncHandler(async (req, res) => {
  const { id, dbId } = req.params;

  const hosting = await prisma.hosting.findFirst({
    where: { id, userId: req.user.id }
  });

  if (!hosting) {
    throw new AppError('Hosting not found', 404, 'HOSTING_NOT_FOUND');
  }

  const database = await prisma.database.findFirst({
    where: { id: dbId, hostingId: id }
  });

  if (!database) {
    throw new AppError('Database not found', 404, 'DATABASE_NOT_FOUND');
  }

  await prisma.database.delete({ where: { id: dbId } });

  // Log activity
  await prisma.activityLog.create({
    data: {
      action: 'DATABASE_DELETED',
      description: `Database ${database.name} deleted`,
      userId: req.user.id,
      hostingId: id
    }
  });

  logger.info(`User ${req.user.username} deleted database: ${database.name}`);

  res.json({
    status: 'success',
    message: 'Database deleted successfully'
  });
});

// Domain management
exports.getDomains = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const hosting = await prisma.hosting.findFirst({
    where: { id, userId: req.user.id }
  });

  if (!hosting) {
    throw new AppError('Hosting not found', 404, 'HOSTING_NOT_FOUND');
  }

  const domains = await prisma.domain.findMany({
    where: { hostingId: id }
  });

  res.json({
    status: 'success',
    data: { domains }
  });
});

exports.addDomain = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, isPrimary = false } = req.body;

  const hosting = await prisma.hosting.findFirst({
    where: { id, userId: req.user.id },
    include: {
      package: true,
      _count: { select: { domains: true } }
    }
  });

  if (!hosting) {
    throw new AppError('Hosting not found', 404, 'HOSTING_NOT_FOUND');
  }

  // Check domain limit
  if (hosting._count.domains >= hosting.package.maxDomains) {
    throw new AppError('Domain limit reached for this package', 400, 'DOMAIN_LIMIT_REACHED');
  }

  // Check if domain already exists
  const existingDomain = await prisma.domain.findUnique({
    where: { name }
  });

  if (existingDomain) {
    throw new AppError('Domain already in use', 400, 'DOMAIN_EXISTS');
  }

  const domain = await prisma.domain.create({
    data: {
      name,
      isPrimary,
      hostingId: id
    }
  });

  // Log activity
  await prisma.activityLog.create({
    data: {
      action: 'DOMAIN_ADDED',
      description: `Domain ${name} added`,
      userId: req.user.id,
      hostingId: id
    }
  });

  logger.info(`User ${req.user.username} added domain: ${name}`);

  res.status(201).json({
    status: 'success',
    message: 'Domain added successfully',
    data: { domain }
  });
});

exports.removeDomain = asyncHandler(async (req, res) => {
  const { id, domainId } = req.params;

  const hosting = await prisma.hosting.findFirst({
    where: { id, userId: req.user.id }
  });

  if (!hosting) {
    throw new AppError('Hosting not found', 404, 'HOSTING_NOT_FOUND');
  }

  const domain = await prisma.domain.findFirst({
    where: { id: domainId, hostingId: id }
  });

  if (!domain) {
    throw new AppError('Domain not found', 404, 'DOMAIN_NOT_FOUND');
  }

  await prisma.domain.delete({ where: { id: domainId } });

  // Log activity
  await prisma.activityLog.create({
    data: {
      action: 'DOMAIN_REMOVED',
      description: `Domain ${domain.name} removed`,
      userId: req.user.id,
      hostingId: id
    }
  });

  logger.info(`User ${req.user.username} removed domain: ${domain.name}`);

  res.json({
    status: 'success',
    message: 'Domain removed successfully'
  });
});

// Resource usage
exports.getResourceUsage = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const hosting = await prisma.hosting.findFirst({
    where: { id, userId: req.user.id },
    include: { package: true }
  });

  if (!hosting) {
    throw new AppError('Hosting not found', 404, 'HOSTING_NOT_FOUND');
  }

  // Get historical data (last 24 hours)
  const history = Array.from({ length: 24 }, (_, i) => ({
    time: new Date(Date.now() - (23 - i) * 60 * 60 * 1000).toISOString(),
    cpu: Math.random() * 50 + 10, // Simulated data
    ram: Math.random() * hosting.package.ramLimit * 0.6,
    disk: hosting.diskUsage + Math.random() * 10
  }));

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
        cpu: hosting.package.cpuLimit * 100, // Percentage
        ram: hosting.package.ramLimit,
        disk: hosting.package.diskLimit
      },
      history
    }
  });
});