const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const imageTypes = {
  'image/jpeg': { extension: '.jpg', matches: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  'image/png': { extension: '.png', matches: (bytes) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { extension: '.webp', matches: (bytes) => bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' },
  'image/gif': { extension: '.gif', matches: (bytes) => ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6)) },
};

function createImageUpload(directory, publicPrefix) {
  fs.mkdirSync(directory, { recursive: true });
  const middleware = multer({
    storage: multer.diskStorage({
      destination: directory,
      filename: (req, file, callback) => {
        const type = imageTypes[file.mimetype];
        if (!type) return callback(new Error('Upload a JPEG, PNG, WebP or GIF image.'));
        return callback(null, `${crypto.randomBytes(16).toString('hex')}${type.extension}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 12 },
    fileFilter: (req, file, callback) => {
      if (!imageTypes[file.mimetype]) return callback(new Error('Upload a JPEG, PNG, WebP or GIF image.'));
      return callback(null, true);
    },
  }).single('imageFile');

  function parseUpload(req, res, next) {
    middleware(req, res, (error) => {
      if (error) {
        const message = error.code === 'LIMIT_FILE_SIZE'
          ? 'Images must be 5 MB or smaller.'
          : error.message || 'Unable to upload this image.';
        return res.status(400).json({ success: false, message });
      }
      return next();
    });
  }

  function publicPath(file) {
    return file ? `${publicPrefix}/${file.filename}` : null;
  }

  function managedFilePath(image) {
    const prefix = `${publicPrefix}/`;
    if (!image || !image.startsWith(prefix)) return null;
    const filename = image.slice(prefix.length);
    if (!/^[a-f0-9]{32}\.(jpg|png|webp|gif)$/.test(filename)) return null;
    return path.join(directory, filename);
  }

  async function remove(image) {
    const filePath = managedFilePath(image);
    if (!filePath) return;
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Unable to remove uploaded image:', error);
    }
  }

  function validateContents(file) {
    if (!file) return true;
    const type = imageTypes[file.mimetype];
    const header = Buffer.alloc(16);
    const descriptor = fs.openSync(file.path, 'r');
    try {
      const bytesRead = fs.readSync(descriptor, header, 0, header.length, 0);
      return type.matches(header.subarray(0, bytesRead));
    } finally {
      fs.closeSync(descriptor);
    }
  }

  return { parseUpload, publicPath, remove, validateContents };
}

module.exports = { createImageUpload };
