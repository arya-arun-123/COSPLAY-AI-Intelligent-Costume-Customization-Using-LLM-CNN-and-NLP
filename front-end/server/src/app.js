import path from 'path';
import { fileURLToPath } from 'url';
import referenceImageRoutes from './routes/referenceImageRoutes.js';
import cors from 'cors';
import express from 'express';
import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import healthRoutes from './routes/health.js';
import brandRoutes from './routes/brandRoutes.js';
import sizeRoutes from './routes/sizeRoutes.js';
import aiGenerationRoutes from './routes/aiGenerationRoutes.js';
import customDesignRoutes from './routes/customDesignRoutes.js';
import llmParserRoutes from './routes/llmParserRoutes.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  '/uploads',
  express.static(path.join(__dirname, '../uploads'))
);
app.use('/api/health', healthRoutes);
app.use('/api/v1/brands', brandRoutes);
app.use('/api/v1/sizes', sizeRoutes);
app.use('/api/v1/custom-designs', customDesignRoutes);

// Base Route - Server health check
app.get('/', (_req, res) => {
  res.json({
    message: 'Welcome to the Cosplay E-commerce API',
    status: 'healthy',
    version: 'v1',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/reference-images', referenceImageRoutes);
app.use('/api/v1/generate-design', aiGenerationRoutes);
app.use('/api/v1/parse-customization', llmParserRoutes);

// 404 handler for unmatched routes
app.use((_req, res) => {
  res.status(404).json({
    status: 'error',
    statusCode: 404,
    message: 'The requested endpoint does not exist.',
  });
});

// Global Error Handling Middleware
app.use((err, _req, res, _next) => {
  let statusCode = err.statusCode || 500;

  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 400;
  }

  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message: err.message || 'Internal Server Error',
    ...(err.errors && { errors: err.errors }),
  });
});

export default app;
