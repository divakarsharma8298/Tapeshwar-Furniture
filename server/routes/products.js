const path = require('path');
const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const { listProducts, saveProduct, deleteProduct, ProductValidationError } = require('../db/database');
const { createImageUpload } = require('../utils/image-upload');

const uploadsRoot = process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'assets', 'uploads');
const productImages = createImageUpload(
  path.join(uploadsRoot, 'products'),
  '/assets/uploads/products'
);
const publicRouter = express.Router();
const adminRouter = express.Router();

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalized);
  }
  return Boolean(value);
}

function getProductPayload(req, previousImage = '') {
  return {
    name: req.body.name,
    category: req.body.category,
    description: req.body.description,
    price: req.body.price,
    image: productImages.publicPath(req.file) || String(req.body.image || previousImage).trim(),
    imageAlt: req.body.imageAlt,
    material: req.body.material,
    size: req.body.size,
    finish: req.body.finish,
    availability: req.body.availability,
    isDemo: normalizeBoolean(req.body.isDemo),
  };
}

publicRouter.get('/', async (req, res, next) => {
  try {
    const products = await listProducts();
    return res.json({ success: true, data: products });
  } catch (error) {
    return next(error);
  }
});

adminRouter.use(requireAdmin);

adminRouter.get('/', async (req, res, next) => {
  try {
    const products = await listProducts({ includeInactive: true });
    return res.json({ success: true, data: products });
  } catch (error) {
    return next(error);
  }
});

adminRouter.post('/', productImages.parseUpload, async (req, res, next) => {
  try {
    if (req.file && !productImages.validateContents(req.file)) {
      await productImages.remove(productImages.publicPath(req.file));
      return res.status(400).json({ success: false, message: 'The uploaded file is not a valid image.' });
    }
    const product = await saveProduct(getProductPayload(req));
    return res.status(201).json({ success: true, message: 'Product added.', data: product });
  } catch (error) {
    if (req.file) await productImages.remove(productImages.publicPath(req.file));
    if (error instanceof ProductValidationError) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return next(error);
  }
});

adminRouter.put('/:id', productImages.parseUpload, async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    if (req.file) await productImages.remove(productImages.publicPath(req.file));
    return res.status(400).json({ success: false, message: 'Invalid product ID.' });
  }
  try {
    if (req.file && !productImages.validateContents(req.file)) {
      await productImages.remove(productImages.publicPath(req.file));
      return res.status(400).json({ success: false, message: 'The uploaded file is not a valid image.' });
    }
    const existingProducts = await listProducts({ includeInactive: true });
    const current = existingProducts.find((product) => product.id === id);
    if (!current) {
      if (req.file) await productImages.remove(productImages.publicPath(req.file));
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    const product = await saveProduct(getProductPayload(req, current.image), id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });
    if (req.file && current.image !== product.image) await productImages.remove(current.image);
    return res.json({ success: true, message: 'Product updated.', data: product });
  } catch (error) {
    if (req.file) await productImages.remove(productImages.publicPath(req.file));
    if (error instanceof ProductValidationError) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return next(error);
  }
});

adminRouter.delete('/:id', async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid product ID.' });
  }
  try {
    const product = await deleteProduct(id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });
    await productImages.remove(product.image);
    return res.json({ success: true, message: 'Product deleted.' });
  } catch (error) {
    return next(error);
  }
});

module.exports = { publicRouter, adminRouter };
