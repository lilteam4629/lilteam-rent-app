const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const assert = require('assert');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]
  );
}

const root = path.join(__dirname, '..');
const templates = walk(path.join(root, 'views')).filter(file => file.endsWith('.ejs'));
for (const file of templates) ejs.compile(fs.readFileSync(file, 'utf8'), { filename: file });
new Function(fs.readFileSync(path.join(root, 'server.js'), 'utf8'));
const rentalTemplate = path.join(root, 'views', 'admin-rentals.ejs');
const rentalHtml = ejs.render(fs.readFileSync(rentalTemplate, 'utf8'), {
  title: 'ร้านเช่า', messages: { error: [], success: [] }, shopName: 'LilTeam', logoImage: null,
  rentedShops: [{ id: 'shop-a', name: 'ร้าน A', slug: 'shop-a', ownerUsername: 'owner', expiresAt: Date.now() + 86400000,
    managementUrl: 'https://shop-a.lilteam.site/admin', features: { boxGame: true, railGame: false, music: false, snow: true, welcomePopup: false, rain: null } }],
  featureCatalog: [{ key: 'boxGame', label: 'กล่องสุ่ม', description: 'ทดสอบ' }, { key: 'snow', label: 'เอฟเฟกต์หิมะ', description: 'ทดสอบ' }],
  featureReleases: [{ id: 'release-a', name: 'ระบบพิเศษ', version: '1.0.0', feature: 'snow', action: 'enable', deployments: [] }],
  transactions: [], sales: [], discordSettings: {}, discordConfigured: false, discordReady: false,
}, { filename: rentalTemplate });
assert(rentalHtml.includes('name="scope" value="selected"'));
assert(rentalHtml.includes('name="scope" value="all"'));
assert(rentalHtml.includes('name="confirmAll"'));
assert(rentalHtml.includes("allToken.value='CONFIRM_ALL_TENANTS'"));
assert(rentalHtml.includes('value="uninstall"'));
assert(rentalHtml.includes('name="shopIds" value="shop-a"'));
assert(rentalHtml.includes('name="releaseId"') && rentalHtml.includes('value="release-a"'));
assert(rentalHtml.includes('/admin/rentals/releases/deploy'));
assert(rentalHtml.includes('https://shop-a.lilteam.site/admin'));
assert(!rentalHtml.includes('ฝนตกหน้าเว็บ:'));
console.log(`Smoke checks passed: ${templates.length} EJS templates, versioned system delivery controls, and server syntax`);
