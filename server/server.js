require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const { initDatabase } = require('./db/database');
const enquiryRoutes = require('./routes/enquiries');
const adminRoutes = require('./routes/admin');
const productRoutes = require('./routes/products');
const contentRoutes = require('./routes/content');

function requireAdminPage(req, res, next) {
  res.set('Cache-Control', 'no-store');
  if (req.session && req.session.isAuthenticated && req.session.adminEmail) return next();
  return res.redirect('/admin/login');
}

const app = express();
const PORT = Number(process.env.PORT || 3000);
const siteRoot = path.join(__dirname, '..');
const dataDir = process.env.DATA_DIR || path.join(siteRoot, 'data');
const sessionDbPath = process.env.SESSION_DB_PATH || path.join(dataDir, 'sessions.sqlite');
const uploadsDir = process.env.UPLOADS_DIR || path.join(siteRoot, 'assets', 'uploads');

function validateConfiguration() {
  const missing = ['SESSION_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD']
    .filter((key) => !process.env[key] || !process.env[key].trim());
  if (missing.length) {
    throw new Error(`Missing required environment configuration: ${missing.join(', ')}.`);
  }
  if (process.env.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters long.');
  }
  if (process.env.ADMIN_PASSWORD.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters long.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.ADMIN_EMAIL.trim())) {
    throw new Error('ADMIN_EMAIL must be a valid email address.');
  }
}

app.disable('x-powered-by');
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new SQLiteStore({
    db: path.basename(sessionDbPath),
    dir: path.dirname(sessionDbPath),
    concurrentDB: true,
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8,
  },
}));

app.use('/api/enquiries', enquiryRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/products', productRoutes.adminRouter);
app.use('/api/products', productRoutes.publicRouter);
app.use('/api/admin/content', contentRoutes.adminRouter);
app.use('/api/content', contentRoutes.publicRouter);

app.get('/admin/login', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.session && req.session.isAuthenticated) {
    return res.redirect('/admin');
  }
  return res.sendFile(path.join(__dirname, 'views', 'admin', 'login.html'));
});

app.get('/admin', requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin', 'dashboard.html'));
});

app.get('/admin/dashboard', requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin', 'dashboard.html'));
});

app.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(siteRoot, 'index.html'));
});

for (const page of ['founder.html', 'furniture-products.html', 'aluminium-work.html']) {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(siteRoot, page));
  });
}

app.use('/assets/uploads', express.static(uploadsDir, {
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
}));
app.use('/assets', express.static(path.join(siteRoot, 'assets'), {
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
}));

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
});

async function startServer() {
  validateConfiguration();
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
