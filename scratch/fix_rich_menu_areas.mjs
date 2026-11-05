import fs from 'fs';
import path from 'path';

const file = path.resolve('scripts/cf_worker.js');
let code = fs.readFileSync(file, 'utf8');

const target = "title: '공식 채널 기본 메뉴',\r\n        layout: 'grid_2x3',";
const replacement = `title: '공식 채널 기본 메뉴',
        layout: 'grid_2x3',
        size: { width: 1200, height: 800 },
        areas: [
          { bounds: { x: 0, y: 0, width: 400, height: 400 }, action: { type: 'message', text: '공식 공지사항' } },
          { bounds: { x: 400, y: 0, width: 400, height: 400 }, action: { type: 'message', text: '고객센터 상담' } },
          { bounds: { x: 800, y: 0, width: 400, height: 400 }, action: { type: 'uri', uri: 'https://line-messenger.dnjstjqppk.workers.dev' } },
          { bounds: { x: 0, y: 400, width: 600, height: 400 }, action: { type: 'message', text: '진행중 이벤트' } },
          { bounds: { x: 600, y: 400, width: 600, height: 400 }, action: { type: 'message', text: '자주 묻는 질문' } }
        ],`.replace(/\n/g, '\r\n');

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync(file, code, 'utf8');
  console.log('Successfully patched areas into richMenus');
} else {
  console.warn('Target not found in cf_worker.js');
}

