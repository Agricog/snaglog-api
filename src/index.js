import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { clerkMiddleware } from '@clerk/express';
import uploadRoutes from './routes/upload.js';
import analyzeRoutes from './routes/analyze.js';
import reportRoutes from './routes/report.js';
import paymentRoutes from './routes/payment.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: [
    'https://app.snaglog.co.uk',
    'https://snaglog-app-production.up.railway.app',
    'http://localhost:5173'
  ],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(clerkMiddleware());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/upload', uploadRoutes);
app.use('/api/analyze', analyzeRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/payment', paymentRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 SnagLog API running on port ${PORT}`);
});
