const mongoose = require('mongoose');

const holdingSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['stock', 'mutual_fund'], required: true },
  quantity: { type: Number, required: true },
  avgBuyPrice: { type: Number, required: true },
  currentPrice: { type: Number, default: 0 },
  purchaseDate: { type: Date, default: Date.now }
});

holdingSchema.virtual('totalInvested').get(function() {
  return this.quantity * this.avgBuyPrice;
});

holdingSchema.virtual('currentValue').get(function() {
  return this.quantity * this.currentPrice;
});

holdingSchema.virtual('pnl').get(function() {
  return this.currentValue - this.totalInvested;
});

holdingSchema.virtual('pnlPercent').get(function() {
  if (this.totalInvested === 0) return 0;
  return ((this.pnl / this.totalInvested) * 100).toFixed(2);
});

const portfolioSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  holdings: [holdingSchema],
  totalInvested: { type: Number, default: 0 },
  currentValue: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Portfolio', portfolioSchema);
