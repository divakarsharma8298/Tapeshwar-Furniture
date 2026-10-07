const test = require('node:test');
const assert = require('node:assert/strict');

const baseUrl = 'http://localhost:3000';

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { raw: text };
  }
  return { response, data };
}

test('admin dashboard workflow is complete', async (t) => {
  const uniqueId = Date.now();
  const uniquePhone = `98${String(Date.now()).slice(-9)}`;
  const uniqueMessage = `Automation workflow enquiry ${uniqueId}. This message should appear in the dashboard and permit status changes.`;

  const adminLogin = await request('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin@tapeshwarfurniture.com',
      password: 'Tapeshwar@2026',
    }),
  });
  assert.equal(adminLogin.response.status, 200, 'admin login should succeed');
  assert.equal(adminLogin.data.success, true, 'login response should be successful');

  const cookieHeader = (adminLogin.response.headers.get('set-cookie') || '').split(';')[0];
  assert.ok(cookieHeader, 'login should set session cookie');

  const stats = await request('/api/enquiries/stats', {
    headers: { Cookie: cookieHeader },
  });
  assert.equal(stats.response.status, 200, 'stats endpoint should be protected');

  const enquiry = await request('/api/enquiries', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Workflow Test User',
      phone: uniquePhone,
      email: `workflow-${uniqueId}@example.com`,
      message: uniqueMessage,
      enquiryType: 'Wardrobe',
      source: 'automation-test',
    }),
  });
  assert.equal(enquiry.response.status, 201, 'public enquiry submission should succeed');
  const enquiryId = enquiry.data.data.id;
  assert.ok(enquiryId, 'new enquiry should be created');

  const list = await request(`/api/enquiries?status=all&search=${encodeURIComponent('Workflow Test User')}`, {
    headers: { Cookie: cookieHeader },
  });
  assert.equal(list.response.status, 200, 'list endpoint should succeed');
  assert.ok(list.data.data.some((item) => item.id === enquiryId), 'new enquiry should appear in dashboard list');

  const detail = await request(`/api/enquiries/${enquiryId}`, {
    headers: { Cookie: cookieHeader },
  });
  assert.equal(detail.response.status, 200, 'detail endpoint should return enquiry details');
  assert.equal(detail.data.data.id, enquiryId, 'detail endpoint should match enquiry');

  const markRead = await request(`/api/enquiries/${enquiryId}/read`, {
    method: 'PATCH',
    headers: { Cookie: cookieHeader },
    body: JSON.stringify({ isRead: true }),
  });
  assert.equal(markRead.response.status, 200, 'read toggle should succeed');
  assert.equal(markRead.data.data.is_read, 1, 'enquiry should be marked as read');

  const statusUpdate = await request(`/api/enquiries/${enquiryId}/status`, {
    method: 'PATCH',
    headers: { Cookie: cookieHeader },
    body: JSON.stringify({ status: 'contacted' }),
  });
  assert.equal(statusUpdate.response.status, 200, 'status update should succeed');
  assert.equal(statusUpdate.data.data.status, 'contacted', 'status should update to contacted');

  const completeStatus = await request(`/api/enquiries/${enquiryId}/status`, {
    method: 'PATCH',
    headers: { Cookie: cookieHeader },
    body: JSON.stringify({ status: 'completed' }),
  });
  assert.equal(completeStatus.response.status, 200, 'completed status should be allowed');
  assert.equal(completeStatus.data.data.status, 'completed', 'status should update to completed');

  const unauthorized = await request('/api/enquiries/stats');
  assert.equal(unauthorized.response.status, 401, 'protected admin route should reject unauthenticated requests');

  const invalid = await request('/api/enquiries', {
    method: 'POST',
    body: JSON.stringify({ name: '', phone: '123', email: 'bad-email', message: 'x' }),
  });
  assert.equal(invalid.response.status, 400, 'invalid form input should be rejected');
});
