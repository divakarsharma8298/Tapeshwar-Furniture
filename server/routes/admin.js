const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { verifyAdminLogin, getStats, listEnquiries } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' },
});

router.post('/login', loginLimiter, async (req, res, next) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required.',
    });
  }

  try {
    const admin = await verifyAdminLogin(email, password);

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    return req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.isAuthenticated = true;
      req.session.adminEmail = admin.email;
      req.session.adminId = admin.id;

      return req.session.save((saveError) => {
        if (saveError) return next(saveError);
        return res.json({
          success: true,
          message: 'Login successful.',
          data: { email: admin.email },
        });
      });
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', requireAdmin, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('connect.sid');
    return res.json({ success: true, message: 'Logged out successfully.' });
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

router.get('/overview', requireAdmin, async (req, res, next) => {
  try {
    const [stats, recentEnquiries] = await Promise.all([
      getStats(),
      listEnquiries({ status: 'all', search: '', limit: 6, offset: 0 }),
    ]);
    return res.json({ success: true, data: { stats, recentEnquiries } });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
