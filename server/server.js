require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const { initDatabase } = require('./db/database');
const enquiryRoutes = require('./routes/enquiries');
const adminRoutes = require('./routes/admin');
const { requireAdmin } = require('./middleware/auth');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const siteRoot = path.join(__dirname, '..');

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'tapeshwar-admin-secret',
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

app.get('/admin/login', (req, res) => {
  if (req.session && req.session.isAuthenticated) {
    return res.redirect('/admin');
  }
  return res.sendFile(path.join(__dirname, 'views', 'admin', 'login.html'));
});

app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin', 'dashboard.html'));
});

app.get('/admin/dashboard', requireAdmin, (req, res) => {
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

app.use('/assets', express.static(path.join(siteRoot, 'assets')));

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
});

async function startServer() {
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
