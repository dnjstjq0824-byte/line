const fs = require('fs');
const markers = ['ChatRoomPage', 'toggleStickerPicker', 'StatusStrip', '_TabletDesk', 'HarborWordmark'];
for (const f of ['apps/user-web/public/luno-messenger.apk', 'apps/user-web/public/luno-messenger-arm64.apk', 'apps/user-web/public/luno-messenger-arm32.apk']) {
  const b = fs.readFileSync(f);
  console.log(f.split('/').pop(), markers.map(m => m + ':' + b.includes(m)).join(' '));
}
