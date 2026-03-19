const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const stockRoutes = require('./routes/stocks');
const mutualFundRoutes = require('./routes/mutualFunds');
const newsRoutes = require('./routes/news');
const aiRoutes = require('./routes/ai');
const providerRoutes = require('./routes/providers');
const portfolioRoutes = require('./routes/portfolio');
const watchlistRoutes = require('./routes/watchlist');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const isProduction = process.env.NODE_ENV === 'production';
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => !isProduction,
  message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// Logging & parsing
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/stocks', stockRoutes);
app.use('/api/mutual-funds', mutualFundRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/watchlist', watchlistRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// DB connect & start
const PORT = process.env.PORT || 5000;
let serverStarted = false;

const startServer = () => {
  if (serverStarted) return;
  serverStarted = true;
  app.listen(PORT, () => console.log(`Arth backend running on port ${PORT}`));
};

const connectMongo = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/arth');
    console.log('MongoDB connected');
  } catch (err) {
    console.error(`MongoDB connection failed: ${err.message}`);
    console.warn('Starting backend in degraded mode. Auth and portfolio features may be limited until MongoDB is reachable.');
  } finally {
    startServer();
  }
};

connectMongo();

module.exports = app;
