const express = require('express');
const path = require('path');
const { requireAdmin } = require('../middleware/auth');
const {
  getSiteContent,
  saveSiteContent,
  SiteContentValidationError,
} = require('../db/database');
const { createImageUpload } = require('../utils/image-upload');

const publicRouter = express.Router();
const adminRouter = express.Router();
const uploadsRoot = process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'assets', 'uploads');
const founderImages = createImageUpload(
  path.join(uploadsRoot, 'founder'),
  '/assets/uploads/founder'
);

publicRouter.get('/', async (req, res, next) => {
  try {
    const content = await getSiteContent();
    return res.json({ success: true, data: content });
  } catch (error) {
    return next(error);
  }
});

adminRouter.use(requireAdmin);

adminRouter.get('/', async (req, res, next) => {
  try {
    const content = await getSiteContent();
    return res.json({ success: true, data: content });
  } catch (error) {
    return next(error);
  }
});

adminRouter.put('/', founderImages.parseUpload, async (req, res, next) => {
  try {
    if (req.file && !founderImages.validateContents(req.file)) {
      await founderImages.remove(founderImages.publicPath(req.file));
      return res.status(400).json({ success: false, message: 'The uploaded file is not a valid image.' });
    }
    const previous = await getSiteContent();
    const updates = { ...req.body };
    if (req.file) updates.founder_portrait = founderImages.publicPath(req.file).slice(1);
    const content = await saveSiteContent(updates);
    if (previous.founder_portrait !== content.founder_portrait) {
      await founderImages.remove(`/${previous.founder_portrait}`);
    }
    return res.json({ success: true, message: 'Website content updated.', data: content });
  } catch (error) {
    if (req.file) await founderImages.remove(founderImages.publicPath(req.file));
    if (error instanceof SiteContentValidationError) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return next(error);
  }
});

module.exports = { publicRouter, adminRouter };
