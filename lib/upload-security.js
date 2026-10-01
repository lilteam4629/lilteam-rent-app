'use strict';
const path = require('node:path');
function imageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { ext: '.png', mime: 'image/png' };
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return { ext: '.jpg', mime: 'image/jpeg' };
  if (buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP') return { ext: '.webp', mime: 'image/webp' };
  return null;
}
function secureUpload(upload) {
  const original = upload.single.bind(upload);
  upload.single = name => (req, res, next) => original(name)(req, res, error => {
    if (error) return next(error);
    if (req.file) {
      const type = imageType(req.file.buffer);
      if (!type) return res.status(400).send('รองรับเฉพาะไฟล์รูป JPG, PNG และ WEBP ที่ถูกต้อง');
      req.file.mimetype = type.mime;
      req.file.originalname = path.basename(req.file.originalname, path.extname(req.file.originalname)) + type.ext;
    }
    next();
  });
  return upload;
}
function publicUpload(req, res, next) {
  if (!/^\/(?:logo|showcase)-[a-zA-Z0-9-]+\.(?:png|jpe?g|webp)$/i.test(req.path)) return res.sendStatus(404);
  next();
}
function sendPrivateSlip(req, res, directory, item, next) {
  if (!item?.slipFile || !/^slip-[a-zA-Z0-9-]+\.(?:png|jpe?g|webp)$/i.test(item.slipFile)) return res.sendStatus(404);
  res.set('Cache-Control', 'private, no-store');
  return res.sendFile(path.join(directory, item.slipFile), error => { if (error) next(error); });
}
module.exports = { imageType, secureUpload, publicUpload, sendPrivateSlip };
