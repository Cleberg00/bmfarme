const fs = require('fs');
const file = fs.readFileSync('api/_services/cloudflare.js','utf8');
const lines = file.split('\n');
// Keep lines 0..480 (index), replace 481..744, keep 745+
const before = lines.slice(0, 481);
const after = lines.slice(745);
const newLayouts = fs.readFileSync('_new_layouts.txt','utf8');
const result = before.join('\n') + '\n' + newLayouts + '\n' + after.join('\n');
fs.writeFileSync('api/_services/cloudflare.js', result, 'utf8');
console.log('Done. New line count:', result.split('\n').length);
