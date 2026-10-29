const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();

const baseUrl = 'http://localhost:3000';
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

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
  assert.ok(adminEmail && adminPassword, 'ADMIN_EMAIL and ADMIN_PASSWORD must be configured for integration tests');
  const uniqueId = Date.now();
  const uniquePhone = `98${String(Date.now()).slice(-9)}`;
  const uniqueMessage = `Automation workflow enquiry ${uniqueId}. This message should appear in the dashboard and permit status changes.`;
  let cookieHeader;
  let enquiryId;
  let productId;
  let originalSiteContent;

  const adminLogin = await request('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({
      email: adminEmail,
      password: adminPassword,
    }),
  });
  assert.equal(adminLogin.response.status, 200, 'admin login should succeed');
  assert.equal(adminLogin.data.success, true, 'login response should be successful');

  cookieHeader = (adminLogin.response.headers.get('set-cookie') || '').split(';')[0];
  assert.ok(cookieHeader, 'login should set session cookie');

  const protectedPage = await request('/admin');
  assert.equal(protectedPage.response.url, `${baseUrl}/admin/login`, 'admin dashboard pages should redirect visitors without a session');

  t.after(async () => {
    if (productId) await request(`/api/admin/products/${productId}`, { method: 'DELETE', headers: { Cookie: cookieHeader } });
    if (enquiryId) await request(`/api/enquiries/${enquiryId}`, { method: 'DELETE', headers: { Cookie: cookieHeader } });
    if (originalSiteContent) {
      await request('/api/admin/content', {
        method: 'PUT',
        headers: { Cookie: cookieHeader },
        body: JSON.stringify(originalSiteContent),
      });
    }
    await request('/api/admin/logout', { method: 'POST', headers: { Cookie: cookieHeader } });
  });

  const unauthorizedProducts = await request('/api/admin/products');
  assert.equal(unauthorizedProducts.response.status, 401, 'product management should require an admin session');
  const unauthorizedContent = await request('/api/admin/content');
  assert.equal(unauthorizedContent.response.status, 401, 'website content management should require an admin session');

  for (const page of ['/', '/founder.html', '/furniture-products.html', '/aluminium-work.html']) {
    const publicPage = await fetch(`${baseUrl}${page}`);
    assert.equal(publicPage.status, 200, `${page} should continue to be served`);
  }

  const siteContent = await request('/api/content');
  assert.equal(siteContent.response.status, 200, 'public website content should load from the database');
  originalSiteContent = siteContent.data.data;
  const contentForm = new FormData();
  contentForm.set('home_intro', `${originalSiteContent.home_intro} Workflow test.`);
  contentForm.set('founder_intro', originalSiteContent.founder_intro);
  contentForm.set('imageFile', new Blob([
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pWQAAAAASUVORK5CYII=', 'base64'),
  ], { type: 'image/png' }), 'founder-test.png');
  const updatedContentResponse = await fetch(`${baseUrl}/api/admin/content`, {
    method: 'PUT',
    headers: { Cookie: cookieHeader },
    body: contentForm,
  });
  const updatedContent = await updatedContentResponse.json();
  assert.equal(updatedContentResponse.status, 200, 'admin should be able to update homepage and founder content');
  assert.ok(updatedContent.data.founder_portrait.startsWith('assets/uploads/founder/'), 'founder portrait uploads should be stored');
  const uploadedPortrait = await fetch(`${baseUrl}/${updatedContent.data.founder_portrait}`);
  assert.equal(uploadedPortrait.status, 200, 'uploaded founder portrait should be publicly served');
  const restoredContent = await request('/api/admin/content', {
    method: 'PUT',
    headers: { Cookie: cookieHeader },
    body: JSON.stringify(originalSiteContent),
  });
  assert.equal(restoredContent.response.status, 200, 'website content should be editable and restorable');
  const removedPortrait = await fetch(`${baseUrl}/${updatedContent.data.founder_portrait}`);
  assert.equal(removedPortrait.status, 404, 'replaced founder portraits should be removed');

  const products = await request('/api/products');
  assert.equal(products.response.status, 200, 'public catalogue endpoint should load');
  assert.ok(products.data.data.length > 0, 'existing demo catalogue should be preserved in the database');

  const stats = await request('/api/enquiries/stats', {
    headers: { Cookie: cookieHeader },
  });
  assert.equal(stats.response.status, 200, 'stats endpoint should be protected');
  const originalProductTotal = stats.data.data.products;
  assert.equal(
    stats.data.data.products,
    products.data.data.filter((product) => !product.isDemo && product.isActive).length,
    'dashboard should count published products and exclude demo listings'
  );

  const invalidProduct = await request('/api/admin/products', {
    method: 'POST',
    headers: { Cookie: cookieHeader },
    body: JSON.stringify({ name: '', category: 'Test', description: 'Invalid product' }),
  });
  assert.equal(invalidProduct.response.status, 400, 'invalid product form input should be rejected');

  const formData = new FormData();
  formData.set('name', `Test Product ${uniqueId}`);
  formData.set('category', 'Test Furniture');
  formData.set('description', 'A product created by the admin workflow integration test.');
  formData.set('price', '1299.50');
  formData.set('imageAlt', 'Test product image');
  formData.set('material', 'Solid wood');
  formData.set('size', 'Custom');
  formData.set('finish', 'Natural');
  formData.set('availability', 'Made to order');
  formData.set('isDemo', 'false');
  formData.set('imageFile', new Blob([
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pWQAAAAASUVORK5CYII=', 'base64'),
  ], { type: 'image/png' }), 'test-product.png');
  const createdProduct = await fetch(`${baseUrl}/api/admin/products`, {
    method: 'POST',
    headers: { Cookie: cookieHeader },
    body: formData,
  });
  const createdProductData = await createdProduct.json();
  assert.equal(createdProduct.status, 201, 'admin should be able to upload and create products');
  productId = createdProductData.data.id;
  assert.ok(createdProductData.data.image.startsWith('/assets/uploads/products/'), 'uploaded image should be stored under the public assets directory');
  const statsWithProduct = await request('/api/enquiries/stats', { headers: { Cookie: cookieHeader } });
  assert.equal(statsWithProduct.data.data.products, originalProductTotal + 1, 'dashboard product total should include a saved real listing');
  const uploadedImage = await fetch(`${baseUrl}${createdProductData.data.image}`);
  assert.equal(uploadedImage.status, 200, 'uploaded product image should be publicly served');

  const updateProduct = await request(`/api/admin/products/${productId}`, {
    method: 'PUT',
    headers: { Cookie: cookieHeader },
    body: JSON.stringify({
      name: `Updated Test Product ${uniqueId}`,
      category: 'Test Furniture',
      description: 'Updated product details from the admin workflow integration test.',
      price: '1499',
      image: createdProductData.data.image,
      imageAlt: 'Updated test product image',
      material: 'Solid wood',
      size: 'Custom',
      finish: 'Natural',
      availability: 'Made to order',
      isDemo: false,
    }),
  });
  assert.equal(updateProduct.response.status, 200, 'admin should be able to edit a stored product');
  assert.equal(updateProduct.data.data.name, `Updated Test Product ${uniqueId}`);
  const deletedProduct = await request(`/api/admin/products/${productId}`, {
    method: 'DELETE',
    headers: { Cookie: cookieHeader },
  });
  assert.equal(deletedProduct.response.status, 200, 'admin should be able to delete a product');
  productId = null;
  const statsWithoutProduct = await request('/api/enquiries/stats', { headers: { Cookie: cookieHeader } });
  assert.equal(statsWithoutProduct.data.data.products, originalProductTotal, 'dashboard product total should reflect product deletions');
  const removedImage = await fetch(`${baseUrl}${createdProductData.data.image}`);
  assert.equal(removedImage.status, 404, 'deleting a product should remove its uploaded image');

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
  enquiryId = enquiry.data.data.id;
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
  const deletedEnquiry = await request(`/api/enquiries/${enquiryId}`, {
    method: 'DELETE',
    headers: { Cookie: cookieHeader },
  });
  assert.equal(deletedEnquiry.response.status, 200, 'admin should be able to delete an enquiry');
  enquiryId = null;
  const missingEnquiry = await request('/api/enquiries/99999999', {
    headers: { Cookie: cookieHeader },
  });
  assert.equal(missingEnquiry.response.status, 404, 'deleted enquiries should no longer be accessible');
});
