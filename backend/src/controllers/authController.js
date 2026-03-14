const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const prisma = new PrismaClient();

// Generate JWT tokens
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

  const refreshToken = jwt.sign(
    { id: userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );

  return { accessToken, refreshToken };
};

// Register new user
exports.register = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'fail',
      errors: errors.array()
    });
  }

  const { email, username, password, firstName, lastName } = req.body;

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

  // Create user
  const user = await prisma.user.create({
    data: {
      email,
      username,
      password: hashedPassword,
      firstName,
      lastName
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

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(user.id);

  // Log activity
  await prisma.activityLog.create({
    data: {
      action: 'USER_REGISTERED',
      description: `New user registered: ${username}`,
      userId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }
  });

  logger.info(`New user registered: ${username} (${email})`);

  res.status(201).json({
    status: 'success',
    message: 'User registered successfully',
    data: {
      user,
      tokens: {
        accessToken,
        refreshToken
      }
    }
  });
});

// Login user
exports.login = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'fail',
      errors: errors.array()
    });
  }

  const { email, password, twoFactorCode } = req.body;

  // Find user
  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  // Check password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  // Check user status
  if (user.status === 'SUSPENDED') {
    throw new AppError('Your account has been suspended', 403, 'ACCOUNT_SUSPENDED');
  }

  if (user.status === 'BANNED') {
    throw new AppError('Your account has been banned', 403, 'ACCOUNT_BANNED');
  }

  // Verify 2FA if enabled
  if (user.twoFactorEnabled) {
    if (!twoFactorCode) {
      return res.status(401).json({
        status: 'fail',
        message: '2FA code required',
        code: '2FA_REQUIRED',
        requires2FA: true
      });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: twoFactorCode,
      window: 1
    });

    if (!verified) {
      throw new AppError('Invalid 2FA code', 401, 'INVALID_2FA');
    }
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  });

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(user.id);

  // Log activity
  await prisma.activityLog.create({
    data: {
      action: 'USER_LOGIN',
      description: `User logged in: ${user.username}`,
      userId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }
  });

  logger.info(`User logged in: ${user.username}`);

  res.json({
    status: 'success',
    message: 'Login successful',
    data: {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        twoFactorEnabled: user.twoFactorEnabled,
        lastLoginAt: user.lastLoginAt
      },
      tokens: {
        accessToken,
        refreshToken
      }
    }
  });
});

// Logout user
exports.logout = asyncHandler(async (req, res) => {
  // Log activity
  await prisma.activityLog.create({
    data: {
      action: 'USER_LOGOUT',
      description: `User logged out: ${req.user.username}`,
      userId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }
  });

  logger.info(`User logged out: ${req.user.username}`);

  res.json({
    status: 'success',
    message: 'Logout successful'
  });
});

// Refresh token
exports.refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new AppError('Refresh token required', 401, 'NO_REFRESH_TOKEN');
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, status: true }
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
    }

    const tokens = generateTokens(user.id);

    res.json({
      status: 'success',
      data: { tokens }
    });
  } catch (error) {
    throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }
});

// Forgot password
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    // Don't reveal if user exists
    return res.json({
      status: 'success',
      message: 'If an account exists, a reset email will be sent'
    });
  }

  // Generate reset token
  const resetToken = require('crypto').randomBytes(32).toString('hex');
  const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetToken,
      resetTokenExpiry
    }
  });

  // TODO: Send email with reset link
  logger.info(`Password reset requested for: ${email}`);

  res.json({
    status: 'success',
    message: 'If an account exists, a reset email will be sent'
  });
});

// Reset password
exports.resetPassword = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'fail',
      errors: errors.array()
    });
  }

  const { token } = req.params;
  const { password } = req.body;

  const user = await prisma.user.findFirst({
    where: {
      resetToken: token,
      resetTokenExpiry: { gt: new Date() }
    }
  });

  if (!user) {
    throw new AppError('Invalid or expired reset token', 400, 'INVALID_TOKEN');
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpiry: null
    }
  });

  logger.info(`Password reset successful for: ${user.email}`);

  res.json({
    status: 'success',
    message: 'Password reset successful'
  });
});

// Setup 2FA
exports.setup2FA = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { twoFactorEnabled: true }
  });

  if (user.twoFactorEnabled) {
    throw new AppError('2FA is already enabled', 400, '2FA_ALREADY_ENABLED');
  }

  const secret = speakeasy.generateSecret({
    name: `${process.env.TOTP_SERVICE_NAME || 'CyberPanel'} (${req.user.email})`
  });

  // Save secret temporarily (will be confirmed after verification)
  await prisma.user.update({
    where: { id: req.user.id },
    data: { twoFactorSecret: secret.base32 }
  });

  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

  res.json({
    status: 'success',
    data: {
      secret: secret.base32,
      qrCode: qrCodeUrl
    }
  });
});

// Verify and enable 2FA
exports.verify2FA = asyncHandler(async (req, res) => {
  const { code } = req.body;

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { twoFactorSecret: true }
  });

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token: code,
    window: 1
  });

  if (!verified) {
    throw new AppError('Invalid 2FA code', 400, 'INVALID_2FA');
  }

  await prisma.user.update({
    where: { id: req.user.id },
    data: { twoFactorEnabled: true }
  });

  logger.info(`2FA enabled for user: ${req.user.username}`);

  res.json({
    status: 'success',
    message: '2FA enabled successfully'
  });
});

// Disable 2FA
exports.disable2FA = asyncHandler(async (req, res) => {
  const { code } = req.body;

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { twoFactorSecret: true, twoFactorEnabled: true }
  });

  if (!user.twoFactorEnabled) {
    throw new AppError('2FA is not enabled', 400, '2FA_NOT_ENABLED');
  }

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token: code,
    window: 1
  });

  if (!verified) {
    throw new AppError('Invalid 2FA code', 400, 'INVALID_2FA');
  }

  await prisma.user.update({
    where: { id: req.user.id },
    data: {
      twoFactorEnabled: false,
      twoFactorSecret: null
    }
  });

  logger.info(`2FA disabled for user: ${req.user.username}`);

  res.json({
    status: 'success',
    message: '2FA disabled successfully'
  });
});

// Get current user
exports.getMe = asyncHandler(async (req, res) => {
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
      _count: {
        select: {
          hostings: true,
          invoices: true,
          notifications: { where: { isRead: false } }
        }
      }
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

  logger.info(`Profile updated for user: ${req.user.username}`);

  res.json({
    status: 'success',
    message: 'Profile updated successfully',
    data: { user }
  });
});

// Change password
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { password: true }
  });

  const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isPasswordValid) {
    throw new AppError('Current password is incorrect', 400, 'INVALID_PASSWORD');
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: req.user.id },
    data: { password: hashedPassword }
  });

  logger.info(`Password changed for user: ${req.user.username}`);

  res.json({
    status: 'success',
    message: 'Password changed successfully'
  });
});