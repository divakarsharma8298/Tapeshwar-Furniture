const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, '..', '..', 'data');
const dbPath = path.join(dataDir, 'tapeshwar-furniture.db');

fs.mkdirSync(dataDir, { recursive: true });

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
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@tapeshwarfurniture.com').trim();
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const existingAdmin = await get('SELECT id, password_hash FROM admin_users WHERE email = ?', [adminEmail]);

  if (!existingAdmin) {
    const hash = await bcrypt.hash(adminPassword, 10);
    await run('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)', [adminEmail, hash]);
  } else {
    const matchesConfiguredPassword = await bcrypt.compare(adminPassword, existingAdmin.password_hash);
    if (!matchesConfiguredPassword) {
      const hash = await bcrypt.hash(adminPassword, 10);
      await run('UPDATE admin_users SET password_hash = ? WHERE email = ?', [hash, adminEmail]);
    }
  }

  return db;
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
  await run('DELETE FROM enquiries WHERE id = ?', [id]);
  return true;
}

async function getStats() {
  const total = await get('SELECT COUNT(*) AS total FROM enquiries');
  const pending = await get('SELECT COUNT(*) AS total FROM enquiries WHERE status IN (?, ?)', ['new', 'pending']);
  const contacted = await get('SELECT COUNT(*) AS total FROM enquiries WHERE status = ?', ['contacted']);
  const completed = await get('SELECT COUNT(*) AS total FROM enquiries WHERE status = ?', ['completed']);
  const unread = await get('SELECT COUNT(*) AS total FROM enquiries WHERE is_read = 0');

  return {
    total: total.total,
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
};
