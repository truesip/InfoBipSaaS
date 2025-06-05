const mongoose = require('mongoose');

const billingSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['credit', 'debit', 'refund'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  credits: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    trim: true
  },
  paymentMethod: {
    type: String,
    enum: ['credit_card', 'paypal', 'bank_transfer', 'system'],
    default: 'system'
  },
  paymentDetails: {
    cardLast4: String,
    cardBrand: String,
    paypalEmail: String,
    bankAccount: String,
    transactionId: String
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  campaign: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign'
  },
  calls: {
    type: Number,
    default: 0
  },
  callRate: {
    type: Number,
    default: 0
  },
  platformRate: {
    type: Number,
    default: 0
  },
  profit: {
    type: Number,
    default: 0
  },
  invoice: {
    invoiceNumber: String,
    invoiceDate: Date,
    dueDate: Date,
    pdfUrl: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Virtual for transaction ID
billingSchema.virtual('transactionId').get(function() {
  return `TRX-${this._id.toString().substr(-8).toUpperCase()}`;
});

// Virtual for invoice number
billingSchema.virtual('invoiceNumber').get(function() {
  if (this.invoice && this.invoice.invoiceNumber) {
    return this.invoice.invoiceNumber;
  }
  const date = this.createdAt || new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const id = this._id.toString().substr(-4).toUpperCase();
  return `INV-${year}${month}-${id}`;
});

const Billing = mongoose.model('Billing', billingSchema);

module.exports = Billing;
