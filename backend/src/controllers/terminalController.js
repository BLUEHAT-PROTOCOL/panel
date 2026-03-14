const { PrismaClient } = require('@prisma/client');
const { NodeSSH } = require('node-ssh');
const crypto = require('crypto');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const prisma = new PrismaClient();

// Store active SSH sessions
const activeSessions = new Map();

// Create terminal session
exports.createSession = asyncHandler(async (req, res) => {
  const { hostingId } = req.params;

  // Verify hosting access
  const hosting = await prisma.hosting.findFirst({
    where: { id: hostingId, userId: req.user.id },
    include: { server: true }
  });

  if (!hosting) {
    throw new AppError('Hosting not found or access denied', 404, 'HOSTING_NOT_FOUND');
  }

  if (!hosting.server) {
    throw new AppError('No server assigned to this hosting', 400, 'NO_SERVER');
  }

  // Generate session ID
  const sessionId = crypto.randomBytes(16).toString('hex');

  // In production, this would connect to the actual server via SSH
  // For demo purposes, we'll create a mock session
  const session = {
    id: sessionId,
    hostingId,
    userId: req.user.id,
    serverId: hosting.server.id,
    createdAt: new Date(),
    lastActivity: new Date()
  };

  activeSessions.set(sessionId, session);

  logger.info(`User ${req.user.username} created terminal session for hosting: ${hosting.name}`);

  res.status(201).json({
    status: 'success',
    message: 'Terminal session created',
    data: {
      sessionId,
      server: {
        name: hosting.server.name,
        hostname: hosting.server.hostname
      }
    }
  });
});

// Close terminal session
exports.closeSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const session = activeSessions.get(sessionId);
  
  if (!session || session.userId !== req.user.id) {
    throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
  }

  // Close SSH connection if exists
  if (session.ssh) {
    session.ssh.dispose();
  }

  activeSessions.delete(sessionId);

  logger.info(`User ${req.user.username} closed terminal session: ${sessionId}`);

  res.json({
    status: 'success',
    message: 'Session closed'
  });
});

// Execute command
exports.executeCommand = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { command } = req.body;

  if (!command) {
    throw new AppError('Command is required', 400, 'COMMAND_REQUIRED');
  }

  const session = activeSessions.get(sessionId);
  
  if (!session || session.userId !== req.user.id) {
    throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
  }

  // Update last activity
  session.lastActivity = new Date();

  // In production, this would execute the command on the actual server
  // For demo purposes, we'll return mock output
  
  // Block dangerous commands
  const dangerousCommands = ['rm -rf /', 'mkfs', 'dd', ':(){ :|:& };:'];
  for (const dangerous of dangerousCommands) {
    if (command.includes(dangerous)) {
      throw new AppError('Command not allowed', 403, 'COMMAND_NOT_ALLOWED');
    }
  }

  // Mock command responses
  let output = '';
  const cmd = command.trim().toLowerCase();

  if (cmd === 'ls' || cmd === 'ls -la' || cmd === 'dir') {
    output = `total 32
drwxr-xr-x 4 user user 4096 Mar  8 12:00 .
drwxr-xr-x 3 user user 4096 Mar  8 11:00 ..
-rw-r--r-- 1 user user  220 Mar  8 11:00 .bash_logout
-rw-r--r-- 1 user user 3771 Mar  8 11:00 .bashrc
-rw-r--r-- 1 user user  807 Mar  8 11:00 .profile
drwxr-xr-x 2 user user 4096 Mar  8 12:00 public_html
drwxr-xr-x 2 user user 4096 Mar  8 12:00 logs`;
  } else if (cmd === 'pwd') {
    output = '/home/user';
  } else if (cmd.startsWith('echo')) {
    output = command.slice(5).replace(/["']/g, '');
  } else if (cmd === 'whoami') {
    output = 'user';
  } else if (cmd === 'uptime') {
    output = '12:00:00 up 5 days, 3:42, 1 user, load average: 0.52, 0.58, 0.59';
  } else if (cmd === 'free -m') {
    output = `              total        used        free      shared  buff/cache   available
Mem:           1024         512         256          64         256         384
Swap:           512           0         512`;
  } else if (cmd === 'df -h') {
    output = `Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1        20G  8.5G   11G  45% /
tmpfs           512M  1.2M  511M   1% /run`;
  } else if (cmd === 'ps aux') {
    output = `USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
user         1  0.0  0.1   4624  2848 ?        Ss   Mar08   0:01 /bin/bash
user       123  0.0  0.2   7840  4128 ?        R+   12:00   0:00 ps aux`;
  } else {
    output = `Command executed: ${command}\nMock output for demonstration purposes.`;
  }

  logger.info(`User ${req.user.username} executed command: ${command}`);

  res.json({
    status: 'success',
    data: {
      command,
      output,
      exitCode: 0
    }
  });
});

// Cleanup inactive sessions (call this periodically)
const cleanupInactiveSessions = () => {
  const now = new Date();
  const maxInactiveTime = 30 * 60 * 1000; // 30 minutes

  for (const [sessionId, session] of activeSessions.entries()) {
    if (now - session.lastActivity > maxInactiveTime) {
      if (session.ssh) {
        session.ssh.dispose();
      }
      activeSessions.delete(sessionId);
      logger.info(`Cleaned up inactive session: ${sessionId}`);
    }
  }
};

// Run cleanup every 5 minutes
setInterval(cleanupInactiveSessions, 5 * 60 * 1000);

module.exports = { cleanupInactiveSessions };