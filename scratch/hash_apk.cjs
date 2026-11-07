const fs = require('fs');
const c = require('crypto');
for (const f of ['luno-messenger-arm64.apk', 'luno-messenger-arm32.apk', 'luno-messenger-x86_64.apk']) {
  const b = fs.readFileSync('apps/user-web/public/' + f);
  console.log(f, b.length, (b.length / 1048576).toFixed(1) + 'MB', c.createHash('sha256').update(b).digest('hex').toUpperCase());
}
