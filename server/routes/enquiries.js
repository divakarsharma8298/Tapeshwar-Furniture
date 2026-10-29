const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const {
  createEnquiry,
  findDuplicateEnquiry,
  listEnquiries,
  getEnquiryById,
  getStats,
  updateEnquiryStatus,
  markEnquiryRead,
  deleteEnquiry,
} = require('../db/database');

const router = express.Router();

function normalizeValidationError(message) {
  return {
    success: false,
    message,
  };
}

router.post('/', async (req, res) => {
  try {
    const payload = req.body || {};
    const name = String(payload.name || '').trim();
    const phone = String(payload.phone || '').trim();
    const email = String(payload.email || '').trim();
    const message = String(payload.message || '').trim();
    const enquiryType = String(payload.enquiryType || payload.project || payload.service || '').trim();
    const source = String(payload.source || 'website').trim();

    if (!name || !phone || !message) {
      return res.status(400).json(normalizeValidationError('Name, phone number and message are required.'));
    }
    if (name.length > 100 || phone.length > 30 || message.length > 3000 || enquiryType.length > 120 || source.length > 80) {
      return res.status(400).json(normalizeValidationError('One or more enquiry fields exceed the maximum length.'));
    }

    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      return res.status(400).json(normalizeValidationError('Please enter a valid phone number.'));
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json(normalizeValidationError('Please enter a valid email address.'));
    }

    if (message.length < 10) {
      return res.status(400).json(normalizeValidationError('Message must be at least 10 characters long.'));
    }

    const duplicate = await findDuplicateEnquiry({ phone, message });
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: 'This enquiry looks like a duplicate. Please wait a moment and try again.',
      });
    }

    const enquiry = await createEnquiry({
      name,
      phone: phoneDigits,
      email: email || null,
      enquiryType: enquiryType || null,
      source,
      message,
    });

    return res.status(201).json({
      success: true,
      message: 'Enquiry submitted successfully.',
      data: enquiry,
    });
  } catch (error) {
    console.error('Unable to save customer enquiry:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to submit enquiry at the moment. Please try again later.',
    });
  }
});

router.get('/', requireAdmin, async (req, res) => {
  try {
    const status = String(req.query.status || 'all');
    const search = String(req.query.search || '');
    if (!['all', 'new', 'pending', 'contacted', 'completed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid enquiry status filter.' });
    }
    if (search.length > 120) {
      return res.status(400).json({ success: false, message: 'Search text must be 120 characters or fewer.' });
    }
    const requestedLimit = Number(req.query.limit || 50);
    const requestedOffset = Number(req.query.offset || 0);
    if (!Number.isInteger(requestedLimit) || !Number.isInteger(requestedOffset) || requestedOffset < 0) {
      return res.status(400).json({ success: false, message: 'Invalid enquiry pagination values.' });
    }
    const limit = Math.min(Math.max(requestedLimit, 1), 100);
    const offset = requestedOffset;

    const enquiries = await listEnquiries({ status, search, limit, offset });
    return res.json({ success: true, data: enquiries });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Unable to load enquiries.' });
  }
});

router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await getStats();
    return res.json({ success: true, data: stats });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Unable to load dashboard statistics.' });
  }
});

router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: 'Invalid enquiry ID.' });
    }

    const enquiry = await getEnquiryById(id);
    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found.' });
    }

    return res.json({ success: true, data: enquiry });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Unable to load enquiry details.' });
  }
});

router.patch('/:id/status', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status || '').trim();

    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: 'Invalid enquiry ID.' });
    }

    const updated = await updateEnquiryStatus(id, status);
    if (!updated) return res.status(404).json({ success: false, message: 'Enquiry not found.' });
    return res.json({ success: true, message: 'Enquiry status updated.', data: updated });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || 'Unable to update enquiry status.' });
  }
});

router.patch('/:id/read', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const isRead = req.body?.isRead ?? req.body?.read ?? true;

    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: 'Invalid enquiry ID.' });
    }

    const updated = await markEnquiryRead(id, Boolean(isRead));
    if (!updated) return res.status(404).json({ success: false, message: 'Enquiry not found.' });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(400).json({ success: false, message: 'Unable to update enquiry read state.' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: 'Invalid enquiry ID.' });
    }

    const deleted = await deleteEnquiry(id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Enquiry not found.' });
    return res.json({ success: true, message: 'Enquiry removed successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Unable to delete enquiry.' });
  }
});

module.exports = router;
