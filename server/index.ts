import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { apiRouter } from './routes/api.js';
import { ConnectionManager } from './services/connectionManager.js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Routes
app.use('/api', apiRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Serve frontend build if available
const clientDistPath = path.resolve(process.cwd(), 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(clientDistPath, 'index.html'));
    }
    next();
  });
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   🚀 WDMT - Web-based Database Management Tool               │
│   Server running at: http://localhost:${PORT}                 │
│                                                             │
│   Supported: PostgreSQL | MySQL | SQLite | MS SQL           │
│   Security:  AES-256-GCM Vault & SSH Bastion Tunnel         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
  `);
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\nGracefully shutting down WDMT...');
  await ConnectionManager.closeAll();
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
