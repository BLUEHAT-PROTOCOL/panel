const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs').promises;
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const prisma = new PrismaClient();

// Base directory for file storage (in production, this would be on the actual server)
const BASE_DIR = process.env.FILE_STORAGE_PATH || './storage';

// Ensure user has access to hosting
const verifyHostingAccess = async (hostingId, userId) => {
  const hosting = await prisma.hosting.findFirst({
    where: { id: hostingId, userId }
  });
  
  if (!hosting) {
    throw new AppError('Hosting not found or access denied', 404, 'HOSTING_NOT_FOUND');
  }
  
  return hosting;
};

// Get hosting directory path
const getHostingPath = (hostingId) => {
  return path.join(BASE_DIR, 'hostings', hostingId);
};

// List files in directory
exports.listFiles = asyncHandler(async (req, res) => {
  const { hostingId } = req.params;
  const { path: relativePath = '/' } = req.query;

  await verifyHostingAccess(hostingId, req.user.id);

  const hostingPath = getHostingPath(hostingId);
  const targetPath = path.join(hostingPath, relativePath);

  // Security check - prevent directory traversal
  if (!targetPath.startsWith(hostingPath)) {
    throw new AppError('Invalid path', 400, 'INVALID_PATH');
  }

  try {
    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    
    const files = entries.map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      size: entry.isFile() ? fs.stat(path.join(targetPath, entry.name)).then(s => s.size) : null,
      modified: entry.isFile() ? fs.stat(path.join(targetPath, entry.name)).then(s => s.mtime) : null
    }));

    // Resolve promises
    const filesWithStats = await Promise.all(
      files.map(async (file) => ({
        ...file,
        size: await file.size,
        modified: await file.modified
      }))
    );

    res.json({
      status: 'success',
      data: {
        path: relativePath,
        files: filesWithStats
      }
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Directory doesn't exist, return empty
      res.json({
        status: 'success',
        data: {
          path: relativePath,
          files: []
        }
      });
    } else {
      throw error;
    }
  }
});

// Download file
exports.downloadFile = asyncHandler(async (req, res) => {
  const { hostingId } = req.params;
  const { path: filePath } = req.query;

  if (!filePath) {
    throw new AppError('File path is required', 400, 'PATH_REQUIRED');
  }

  await verifyHostingAccess(hostingId, req.user.id);

  const hostingPath = getHostingPath(hostingId);
  const targetPath = path.join(hostingPath, filePath);

  // Security check
  if (!targetPath.startsWith(hostingPath)) {
    throw new AppError('Invalid path', 400, 'INVALID_PATH');
  }

  // Check if file exists
  try {
    const stats = await fs.stat(targetPath);
    if (!stats.isFile()) {
      throw new AppError('Not a file', 400, 'NOT_A_FILE');
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new AppError('File not found', 404, 'FILE_NOT_FOUND');
    }
    throw error;
  }

  res.download(targetPath);

  logger.info(`User ${req.user.username} downloaded file: ${filePath}`);
});

// Upload file
exports.uploadFile = asyncHandler(async (req, res) => {
  const { hostingId } = req.params;
  const { path: targetDir = '/', content, filename } = req.body;

  if (!filename) {
    throw new AppError('Filename is required', 400, 'FILENAME_REQUIRED');
  }

  await verifyHostingAccess(hostingId, req.user.id);

  const hostingPath = getHostingPath(hostingId);
  const targetPath = path.join(hostingPath, targetDir, filename);

  // Security check
  if (!targetPath.startsWith(hostingPath)) {
    throw new AppError('Invalid path', 400, 'INVALID_PATH');
  }

  // Check file extension
  const ext = path.extname(filename).toLowerCase().slice(1);
  const allowedExtensions = (process.env.ALLOWED_EXTENSIONS || '').split(',');
  
  if (allowedExtensions.length > 0 && !allowedExtensions.includes(ext)) {
    throw new AppError('File type not allowed', 400, 'FILE_TYPE_NOT_ALLOWED');
  }

  // Ensure directory exists
  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  // Write file
  const buffer = Buffer.from(content, 'base64');
  await fs.writeFile(targetPath, buffer);

  logger.info(`User ${req.user.username} uploaded file: ${filename}`);

  res.json({
    status: 'success',
    message: 'File uploaded successfully'
  });
});

// Create directory
exports.createDirectory = asyncHandler(async (req, res) => {
  const { hostingId } = req.params;
  const { path: targetPath, name } = req.body;

  if (!name) {
    throw new AppError('Directory name is required', 400, 'NAME_REQUIRED');
  }

  await verifyHostingAccess(hostingId, req.user.id);

  const hostingPath = getHostingPath(hostingId);
  const dirPath = path.join(hostingPath, targetPath || '', name);

  // Security check
  if (!dirPath.startsWith(hostingPath)) {
    throw new AppError('Invalid path', 400, 'INVALID_PATH');
  }

  await fs.mkdir(dirPath, { recursive: true });

  logger.info(`User ${req.user.username} created directory: ${name}`);

  res.json({
    status: 'success',
    message: 'Directory created successfully'
  });
});

// Rename file/directory
exports.renameFile = asyncHandler(async (req, res) => {
  const { hostingId } = req.params;
  const { oldPath, newName } = req.body;

  if (!oldPath || !newName) {
    throw new AppError('Old path and new name are required', 400, 'PARAMS_REQUIRED');
  }

  await verifyHostingAccess(hostingId, req.user.id);

  const hostingPath = getHostingPath(hostingId);
  const oldFullPath = path.join(hostingPath, oldPath);
  const newFullPath = path.join(path.dirname(oldFullPath), newName);

  // Security check
  if (!oldFullPath.startsWith(hostingPath) || !newFullPath.startsWith(hostingPath)) {
    throw new AppError('Invalid path', 400, 'INVALID_PATH');
  }

  await fs.rename(oldFullPath, newFullPath);

  logger.info(`User ${req.user.username} renamed ${oldPath} to ${newName}`);

  res.json({
    status: 'success',
    message: 'Renamed successfully'
  });
});

// Delete file/directory
exports.deleteFile = asyncHandler(async (req, res) => {
  const { hostingId } = req.params;
  const { path: targetPath } = req.query;

  if (!targetPath) {
    throw new AppError('Path is required', 400, 'PATH_REQUIRED');
  }

  await verifyHostingAccess(hostingId, req.user.id);

  const hostingPath = getHostingPath(hostingId);
  const fullPath = path.join(hostingPath, targetPath);

  // Security check
  if (!fullPath.startsWith(hostingPath)) {
    throw new AppError('Invalid path', 400, 'INVALID_PATH');
  }

  try {
    const stats = await fs.stat(fullPath);
    
    if (stats.isDirectory()) {
      await fs.rmdir(fullPath, { recursive: true });
    } else {
      await fs.unlink(fullPath);
    }

    logger.info(`User ${req.user.username} deleted: ${targetPath}`);

    res.json({
      status: 'success',
      message: 'Deleted successfully'
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new AppError('File or directory not found', 404, 'NOT_FOUND');
    }
    throw error;
  }
});

// Get file content
exports.getFileContent = asyncHandler(async (req, res) => {
  const { hostingId } = req.params;
  const { path: filePath } = req.query;

  if (!filePath) {
    throw new AppError('File path is required', 400, 'PATH_REQUIRED');
  }

  await verifyHostingAccess(hostingId, req.user.id);

  const hostingPath = getHostingPath(hostingId);
  const targetPath = path.join(hostingPath, filePath);

  // Security check
  if (!targetPath.startsWith(hostingPath)) {
    throw new AppError('Invalid path', 400, 'INVALID_PATH');
  }

  try {
    const stats = await fs.stat(targetPath);
    
    if (!stats.isFile()) {
      throw new AppError('Not a file', 400, 'NOT_A_FILE');
    }

    // Check file size (max 5MB for editing)
    if (stats.size > 5 * 1024 * 1024) {
      throw new AppError('File too large for editing', 400, 'FILE_TOO_LARGE');
    }

    const content = await fs.readFile(targetPath, 'utf-8');

    res.json({
      status: 'success',
      data: {
        content,
        size: stats.size,
        modified: stats.mtime
      }
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new AppError('File not found', 404, 'FILE_NOT_FOUND');
    }
    throw error;
  }
});

// Save file content
exports.saveFileContent = asyncHandler(async (req, res) => {
  const { hostingId } = req.params;
  const { path: filePath, content } = req.body;

  if (!filePath || content === undefined) {
    throw new AppError('File path and content are required', 400, 'PARAMS_REQUIRED');
  }

  await verifyHostingAccess(hostingId, req.user.id);

  const hostingPath = getHostingPath(hostingId);
  const targetPath = path.join(hostingPath, filePath);

  // Security check
  if (!targetPath.startsWith(hostingPath)) {
    throw new AppError('Invalid path', 400, 'INVALID_PATH');
  }

  // Ensure directory exists
  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  await fs.writeFile(targetPath, content, 'utf-8');

  logger.info(`User ${req.user.username} saved file: ${filePath}`);

  res.json({
    status: 'success',
    message: 'File saved successfully'
  });
});