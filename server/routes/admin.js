const express = require('express');
const { verifyAdminLogin } = require('../db/database');

const router = express.Router();

router.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required.',
    });
  }

  const admin = await verifyAdminLogin(email, password);

  if (!admin) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password.',
    });
  }

  req.session.isAuthenticated = true;
  req.session.adminEmail = admin.email;
  req.session.adminId = admin.id;

  return res.json({
    success: true,
    message: 'Login successful.',
    data: { email: admin.email },
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: 'Logged out successfully.' });
  });
});

router.get('/session', (req, res) => {
  if (req.session && req.session.isAuthenticated) {
    return res.json({
      success: true,
      authenticated: true,
      email: req.session.adminEmail,
    });
  }

  return res.json({ success: true, authenticated: false });
});

module.exports = router;
