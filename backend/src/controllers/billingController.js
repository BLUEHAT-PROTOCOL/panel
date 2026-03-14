const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const prisma = new PrismaClient();

// Generate invoice number
const generateInvoiceNumber = () => {
  const prefix = 'INV';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

// Generate transaction ID
const generateTransactionId = () => {
  return `TXN-${crypto.randomBytes(16).toString('hex').toUpperCase()}`;
};

// User routes
exports.getMyInvoices = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = { userId: req.user.id };
  if (status) where.status = status;

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        _count: { select: { transactions: true } }
      }
    }),
    prisma.invoice.count({ where })
  ]);

  res.json({
    status: 'success',
    data: {
      invoices,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

exports.getInvoiceDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const invoice = await prisma.invoice.findFirst({
    where: {
      id,
      userId: req.user.id
    },
    include: {
      items: {
        include: {
          hosting: { select: { name: true } }
        }
      },
      transactions: true
    }
  });

  if (!invoice) {
    throw new AppError('Invoice not found', 404, 'INVOICE_NOT_FOUND');
  }

  res.json({
    status: 'success',
    data: { invoice }
  });
});

exports.payInvoice = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { method = 'credit_card' } = req.body;

  const invoice = await prisma.invoice.findFirst({
    where: {
      id,
      userId: req.user.id,
      status: 'PENDING'
    }
  });

  if (!invoice) {
    throw new AppError('Invoice not found or already paid', 404, 'INVOICE_NOT_FOUND');
  }

  // Create transaction
  const transaction = await prisma.transaction.create({
    data: {
      transactionId: generateTransactionId(),
      userId: req.user.id,
      invoiceId: id,
      type: 'PAYMENT',
      status: 'COMPLETED',
      amount: invoice.total,
      method,
      gatewayData: {}
    }
  });

  // Update invoice
  await prisma.invoice.update({
    where: { id },
    data: {
      status: 'PAID',
      paidAt: new Date()
    }
  });

  // Log activity
  await prisma.activityLog.create({
    data: {
      action: 'INVOICE_PAID',
      description: `Invoice ${invoice.invoiceNumber} paid`,
      userId: req.user.id,
      metadata: { invoiceId: id, amount: invoice.total }
    }
  });

  logger.info(`User ${req.user.username} paid invoice: ${invoice.invoiceNumber}`);

  res.json({
    status: 'success',
    message: 'Payment successful',
    data: { transaction }
  });
});

exports.getMyTransactions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: req.user.id },
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        invoice: { select: { invoiceNumber: true } }
      }
    }),
    prisma.transaction.count({ where: { userId: req.user.id } })
  ]);

  res.json({
    status: 'success',
    data: {
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

// Admin routes
exports.getAllInvoices = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status, userId } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = {};
  if (status) where.status = status;
  if (userId) where.userId = userId;

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, email: true } },
        items: true,
        _count: { select: { transactions: true } }
      }
    }),
    prisma.invoice.count({ where })
  ]);

  res.json({
    status: 'success',
    data: {
      invoices,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

exports.createInvoice = asyncHandler(async (req, res) => {
  const { userId, items, dueDays = 7 } = req.body;

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const tax = subtotal * 0.1; // 10% tax
  const total = subtotal + tax;

  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + dueDays);

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: generateInvoiceNumber(),
      userId,
      subtotal,
      tax,
      total,
      dueAt,
      items: {
        create: items.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.quantity * item.unitPrice,
          hostingId: item.hostingId
        }))
      }
    },
    include: {
      user: { select: { username: true, email: true } },
      items: true
    }
  });

  // Create notification
  await prisma.notification.create({
    data: {
      title: 'New Invoice',
      message: `Invoice #${invoice.invoiceNumber} has been created. Amount: $${total}`,
      type: 'INFO',
      userId
    }
  });

  logger.info(`Admin ${req.user.username} created invoice: ${invoice.invoiceNumber}`);

  res.status(201).json({
    status: 'success',
    message: 'Invoice created successfully',
    data: { invoice }
  });
});

exports.updateInvoiceStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const invoice = await prisma.invoice.update({
    where: { id },
    data: { status },
    include: {
      user: { select: { id: true, username: true } }
    }
  });

  // Create notification
  await prisma.notification.create({
    data: {
      title: 'Invoice Status Updated',
      message: `Invoice #${invoice.invoiceNumber} status changed to ${status}`,
      type: status === 'PAID' ? 'SUCCESS' : 'INFO',
      userId: invoice.userId
    }
  });

  logger.info(`Admin ${req.user.username} updated invoice ${invoice.invoiceNumber} status to ${status}`);

  res.json({
    status: 'success',
    message: 'Invoice status updated'
  });
});