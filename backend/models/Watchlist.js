const mongoose = require('mongoose');

const watchlistSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{
    symbol: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['stock', 'mutual_fund'], default: 'stock' },
    addedAt: { type: Date, default: Date.now },
    alertPrice: { type: Number, default: null },
    notes: { type: String, default: '' }
  }],
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Watchlist', watchlistSchema);
