function requireAdmin(req, res, next) {
  if (req.session && req.session.isAuthenticated && req.session.adminEmail) {
    return next();
  }

  return res.status(401).json({
    success: false,
    message: 'Unauthorized. Please log in to continue.',
  });
}

module.exports = {
  requireAdmin,
};
