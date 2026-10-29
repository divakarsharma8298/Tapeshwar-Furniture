const fs = require('fs');
const path = require('path');
require('dotenv').config();

const requiredKeys = ['SESSION_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'];
const envPath = path.join(__dirname, '..', '.env');
const issues = [];

if (!fs.existsSync(envPath)) {
  issues.push('Create a .env file from .env.example before starting the app.');
}

for (const key of requiredKeys) {
  const value = process.env[key];
  if (!value || !String(value).trim()) {
    issues.push(`${key} is missing from the environment.`);
    continue;
  }

  if (key === 'SESSION_SECRET' && String(value).trim().length < 32) {
    issues.push('SESSION_SECRET must be at least 32 characters long.');
  }

  if (key === 'ADMIN_PASSWORD' && String(value).trim().length < 12) {
    issues.push('ADMIN_PASSWORD must be at least 12 characters long.');
  }

  if (key === 'ADMIN_EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim())) {
    issues.push('ADMIN_EMAIL must be a valid email address.');
  }
}

if (issues.length) {
  console.error('Environment validation failed:');
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log('Environment validation passed. Required settings are present and valid.');
