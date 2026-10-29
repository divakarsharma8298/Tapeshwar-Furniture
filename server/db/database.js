const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'tapeshwar-furniture.db');

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows || []);
    });
  });
}

async function initDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS enquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      enquiry_type TEXT,
      source TEXT DEFAULT 'website',
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS site_content (
      content_key TEXT PRIMARY KEY,
      content_value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const defaultContent = [
    ['home_intro', 'Custom furniture, modular kitchens and complete woodwork — thoughtfully designed for your space and crafted with lasting quality.'],
    ['founder_intro', 'With over 35 years of hands-on experience, Tapeshwar Thakur has built his journey around craftsmanship, quality, reliability, and a deep understanding of furniture and project execution.'],
    ['founder_portrait', 'assets/images/founder/founder-portrait.png'],
  ];
  for (const [key, value] of defaultContent) {
    await run('INSERT OR IGNORE INTO site_content (content_key, content_value) VALUES (?, ?)', [key, value]);
  }

  await run(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      price REAL,
      image TEXT NOT NULL,
      image_alt TEXT NOT NULL,
      material TEXT NOT NULL DEFAULT '',
      size TEXT NOT NULL DEFAULT '',
      finish TEXT NOT NULL DEFAULT '',
      availability TEXT NOT NULL DEFAULT '',
      is_demo INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const adminEmail = process.env.ADMIN_EMAIL.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  const existingAdmin = await get('SELECT id, password_hash FROM admin_users WHERE email = ?', [adminEmail]);

  if (!existingAdmin) {
    const hash = await bcrypt.hash(adminPassword, 12);
    await run('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)', [adminEmail, hash]);
  } else {
    const matchesConfiguredPassword = await bcrypt.compare(adminPassword, existingAdmin.password_hash);
    if (!matchesConfiguredPassword || bcrypt.getRounds(existingAdmin.password_hash) < 12) {
      const hash = await bcrypt.hash(adminPassword, 12);
      await run('UPDATE admin_users SET password_hash = ? WHERE email = ?', [hash, adminEmail]);
    }
  }

  const productCount = await get('SELECT COUNT(*) AS total FROM products');
  if (productCount.total === 0) {
    const existingProducts = [
      ['Beds', 'Bed - Demo Listing', 'assets/images/furniture/bed.jpg', 'Wooden bed frame in a furnished bedroom'],
      ['Sofas', 'Sofa - Demo Listing', 'assets/images/furniture/sofa.jpg', 'Sofa in a furnished living room'],
      ['Dining Tables', 'Dining Table - Demo Listing', 'assets/images/furniture/dining-table.jpg', 'Dining room furniture and table'],
      ['Chairs', 'Chair - Demo Listing', 'assets/images/furniture/chair.jpg', 'Chair in a furnished interior'],
      ['Wardrobes', 'Wardrobe - Demo Listing', 'assets/images/furniture/wardrobe.jpg', 'Wardrobe furniture in a home interior'],
      ['Dressing Tables', 'Dressing Table - Demo Listing', 'assets/images/furniture/dressing-table.jpg', 'Dressing table with mirror and flowers'],
      ['Wooden Doors', 'Wooden Door - Demo Listing', 'assets/images/woodwork/wood-main-door.jpg', 'Hand-carved wooden main door'],
      ['Other Custom Furniture', 'Custom Furniture - Demo Listing', 'assets/images/furniture/custom-work.jpg', 'Craftsperson working on a wooden product'],
    ];
    for (const [category, name, image, imageAlt] of existingProducts) {
      await run(
        `INSERT INTO products
          (name, category, description, image, image_alt, material, size, finish, availability, is_demo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          name,
          category,
          'Demo listing only. Confirm the exact model and product description with the owner.',
          image,
          imageAlt,
          'To be confirmed by owner.',
          'To be confirmed by owner.',
          'To be confirmed by owner.',
          'To be confirmed by owner.',
        ]
      );
    }
  }

  return db;
}

async function getSiteContent() {
  const rows = await all('SELECT content_key, content_value FROM site_content');
  return Object.fromEntries(rows.map((row) => [row.content_key, row.content_value]));
}

async function saveSiteContent(content) {
  const allowedFields = ['home_intro', 'founder_intro', 'founder_portrait'];
  const updates = [];
  for (const key of allowedFields) {
    if (Object.hasOwn(content, key)) {
      const value = String(content[key] || '').trim();
      if (!value || value.length > (key === 'founder_portrait' ? 300 : 1000)) {
        throw new SiteContentValidationError(`${key.replace('_', ' ')} is required and must fit within the allowed length.`);
      }
      if (key === 'founder_portrait') {
        const isExistingPhoto = /^assets\/images\/founder\/[A-Za-z0-9_.-]+\.(jpg|jpeg|png|webp|gif)$/i.test(value);
        const isUploadedPhoto = /^assets\/uploads\/founder\/[a-f0-9]{32}\.(jpg|png|webp|gif)$/.test(value);
        const siteRoot = path.join(__dirname, '..', '..');
        const uploadsDir = process.env.UPLOADS_DIR || path.join(siteRoot, 'assets', 'uploads');
        const candidatePaths = [path.join(siteRoot, value.replace(/^\/?/, ''))];
        if (value.startsWith('assets/uploads/') || value.startsWith('/assets/uploads/')) {
          const relativeFilename = value.replace(/^\/?assets\/uploads\//, '');
          candidatePaths.push(path.join(uploadsDir, relativeFilename));
        }
        if ((!isExistingPhoto && !isUploadedPhoto) || !candidatePaths.some((candidate) => fs.existsSync(candidate))) {
          throw new SiteContentValidationError('Choose a valid founder photo in the founder image library or upload a new image.');
        }
      }
      updates.push([key, value]);
    }
  }
  if (!updates.length) {
    throw new SiteContentValidationError('Provide at least one website content field to update.');
  }
  for (const [key, value] of updates) {
    await run(
      `INSERT INTO site_content (content_key, content_value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(content_key) DO UPDATE SET content_value = excluded.content_value, updated_at = CURRENT_TIMESTAMP`,
      [key, value]
    );
  }
  return getSiteContent();
}

class SiteContentValidationError extends Error {}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalized);
  }
  return Boolean(value);
}

function normalizeProductFields(product) {
  return {
    name: String(product.name || '').trim(),
    category: String(product.category || '').trim(),
    description: String(product.description || '').trim(),
    price: product.price === '' || product.price == null ? null : Number(product.price),
    image: String(product.image || '').trim(),
    imageAlt: String(product.imageAlt || product.name || '').trim(),
    material: String(product.material || '').trim(),
    size: String(product.size || '').trim(),
    finish: String(product.finish || '').trim(),
    availability: String(product.availability || '').trim(),
    isDemo: normalizeBoolean(product.isDemo),
  };
}

class ProductValidationError extends Error {}

function validateProduct(product) {
  if (!product.name || product.name.length > 120) {
    throw new ProductValidationError('Product name is required and must be 120 characters or fewer.');
  }
  if (!product.category || product.category.length > 80) {
    throw new ProductValidationError('Product category is required and must be 80 characters or fewer.');
  }
  if (!product.description || product.description.length > 3000) {
    throw new ProductValidationError('Product description is required and must be 3000 characters or fewer.');
  }
  if (!product.image || product.image.length > 500 || !/^\/?assets\/[a-zA-Z0-9_./-]+$/.test(product.image) || product.image.includes('..')) {
    throw new ProductValidationError('Choose an uploaded image or provide a valid local assets path.');
  }
  if (!product.imageAlt || product.imageAlt.length > 180) {
    throw new ProductValidationError('Image description is required and must be 180 characters or fewer.');
  }
  if (product.price !== null && (!Number.isFinite(product.price) || product.price < 0 || product.price > 100000000)) {
    throw new ProductValidationError('Price must be a number between 0 and 100000000, or left blank.');
  }
  for (const field of ['material', 'size', 'finish', 'availability']) {
    if (product[field].length > 160) {
      throw new ProductValidationError(`${field[0].toUpperCase()}${field.slice(1)} must be 160 characters or fewer.`);
    }
  }
  return product;
}

function mapProduct(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    price: row.price,
    image: row.image,
    imageAlt: row.image_alt,
    material: row.material,
    size: row.size,
    finish: row.finish,
    availability: row.availability,
    isDemo: Boolean(row.is_demo),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listProducts({ includeInactive = false } = {}) {
  const rows = await all(
    `SELECT * FROM products ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY id ASC`
  );
  return rows.map(mapProduct);
}

async function getProductCount() {
  const row = await get('SELECT COUNT(*) AS total FROM products WHERE is_demo = 0 AND is_active = 1');
  return row.total;
}

async function saveProduct(product, id = null) {
  const values = validateProduct(normalizeProductFields(product));
  if (id === null) {
    const result = await run(
      `INSERT INTO products
        (name, category, description, price, image, image_alt, material, size, finish, availability, is_demo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        values.name, values.category, values.description, values.price, values.image,
        values.imageAlt, values.material, values.size, values.finish, values.availability,
        values.isDemo ? 1 : 0,
      ]
    );
    return mapProduct(await get('SELECT * FROM products WHERE id = ?', [result.id]));
  }

  const result = await run(
    `UPDATE products SET
      name = ?, category = ?, description = ?, price = ?, image = ?, image_alt = ?,
      material = ?, size = ?, finish = ?, availability = ?, is_demo = ?,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      values.name, values.category, values.description, values.price, values.image,
      values.imageAlt, values.material, values.size, values.finish, values.availability,
      values.isDemo ? 1 : 0, id,
    ]
  );
  return result.changes ? mapProduct(await get('SELECT * FROM products WHERE id = ?', [id])) : null;
}

async function deleteProduct(id) {
  const product = await get('SELECT * FROM products WHERE id = ?', [id]);
  if (!product) return null;
  await run('DELETE FROM products WHERE id = ?', [id]);
  return mapProduct(product);
}

async function createEnquiry({ name, phone, email, enquiryType, source, message }) {
  const cleanedMessage = (message || '').trim();
  const cleanedName = (name || '').trim();
  const cleanedPhone = (phone || '').trim();
  const cleanedEmail = (email || '').trim();

  const result = await run(
    `INSERT INTO enquiries (name, phone, email, enquiry_type, source, message, status, is_read, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [cleanedName, cleanedPhone, cleanedEmail || null, enquiryType || null, source || 'website', cleanedMessage]
  );

  return get('SELECT * FROM enquiries WHERE id = ?', [result.id]);
}

async function listEnquiries({ status, search, limit = 50, offset = 0 }) {
  let sql = `SELECT * FROM enquiries`;
  const params = [];
  const filters = [];

  if (status && status !== 'all') {
    if (status === 'pending') {
      filters.push('status IN (?, ?)');
      params.push('new', 'pending');
    } else {
      filters.push('status = ?');
      params.push(status);
    }
  }

  if (search && search.trim()) {
    filters.push('(name LIKE ? OR phone LIKE ? OR email LIKE ? OR message LIKE ? OR enquiry_type LIKE ?)');
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term, term);
  }

  if (filters.length) {
    sql += ` WHERE ${filters.join(' AND ')}`;
  }

  sql += ' ORDER BY is_read ASC, created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  return all(sql, params);
}

async function getEnquiryById(id) {
  return get('SELECT * FROM enquiries WHERE id = ?', [id]);
}

async function updateEnquiryStatus(id, status) {
  const validStatuses = ['new', 'pending', 'contacted', 'completed'];
  if (!validStatuses.includes(status)) {
    throw new Error('Invalid enquiry status');
  }

  await run(
    'UPDATE enquiries SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [status, id]
  );

  return getEnquiryById(id);
}

async function markEnquiryRead(id, isRead = true) {
  const value = isRead ? 1 : 0;
  await run('UPDATE enquiries SET is_read = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [value, id]);
  return getEnquiryById(id);
}

async function deleteEnquiry(id) {
  const result = await run('DELETE FROM enquiries WHERE id = ?', [id]);
  return result.changes > 0;
}

async function getStats() {
  const total = await get('SELECT COUNT(*) AS total FROM enquiries');
  const pending = await get('SELECT COUNT(*) AS total FROM enquiries WHERE status IN (?, ?)', ['new', 'pending']);
  const contacted = await get('SELECT COUNT(*) AS total FROM enquiries WHERE status = ?', ['contacted']);
  const completed = await get('SELECT COUNT(*) AS total FROM enquiries WHERE status = ?', ['completed']);
  const unread = await get('SELECT COUNT(*) AS total FROM enquiries WHERE is_read = 0');
  const products = await getProductCount();

  return {
    total: total.total,
    products: products,
    pending: pending.total,
    contacted: contacted.total,
    completed: completed.total,
    unread: unread.total,
  };
}

async function findDuplicateEnquiry({ phone, message }) {
  const normalizedPhone = (phone || '').trim();
  const normalizedMessage = (message || '').trim();

  if (!normalizedPhone || !normalizedMessage) {
    return null;
  }

  return get(`
    SELECT * FROM enquiries
    WHERE phone = ?
      AND message = ?
      AND created_at >= datetime('now', '-10 minutes')
    ORDER BY created_at DESC
    LIMIT 1
  `, [normalizedPhone, normalizedMessage]);
}

async function verifyAdminLogin(email, password) {
  const admin = await get('SELECT * FROM admin_users WHERE email = ?', [email]);
  if (!admin) {
    return null;
  }

  const isValid = await bcrypt.compare(password, admin.password_hash);
  if (!isValid) {
    return null;
  }

  return { id: admin.id, email: admin.email };
}

module.exports = {
  db,
  initDatabase,
  createEnquiry,
  listEnquiries,
  getEnquiryById,
  updateEnquiryStatus,
  markEnquiryRead,
  deleteEnquiry,
  getStats,
  findDuplicateEnquiry,
  verifyAdminLogin,
  listProducts,
  getProductCount,
  getSiteContent,
  saveSiteContent,
  saveProduct,
  deleteProduct,
  ProductValidationError,
  SiteContentValidationError,
};
