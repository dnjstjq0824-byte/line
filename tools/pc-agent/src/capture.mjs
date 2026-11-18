// S7: web screenshots for reports. The default implementation serves the
// task worktree's user-web with vite and shoots each configured page at
// phone and PC sizes with the repo's own Playwright. Tests inject a fake
// capture function instead; unauthenticated pages render as the login view.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { killTree } from './proc.mjs';

export const CAPTURE_SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'pc', width: 1280, height: 800 },
];

export function shotName(page, size) {
  const slug = String(page || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join('-') || 'home';
  return `shot-${slug}-${size}.png`;
}

// Serves the worktree's user-web on 127.0.0.1. Resolves { url, stop } once
// vite prints its Local address; always stop() the server afterwards.
export async function serveWorktreeWeb(worktree, { timeoutMs = 60000 } = {}) {
  const cwd = join(worktree, 'apps', 'user-web');
  const viteBin = join(cwd, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(viteBin)) throw new Error(`vite is not installed under ${cwd} (node_modules link missing?)`);
  const child = spawn(process.execPath, [viteBin, '--port', '5199', '--host', '127.0.0.1'], {
    cwd, shell: false, windowsHide: true, env: { ...process.env, FORCE_COLOR: '0' },
  });
  let output = '';
  const found = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(''), timeoutMs);
    const onData = (chunk) => {
      output += String(chunk);
      const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
      const m = /Local:\s+(http:\/\/\S+)/.exec(plain);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', () => { clearTimeout(timer); resolve(''); });
    child.on('close', () => { clearTimeout(timer); resolve(''); });
  });
  if (!found) {
    killTree(child.pid);
    throw new Error(`vite did not come up in ${cwd}: ${output.slice(-400)}`);
  }
  return { url: found.replace(/\/+$/, ''), stop: () => killTree(child.pid) };
}

export async function shootPages({ playwright, baseUrl, pages, sizes = CAPTURE_SIZES, timeoutMs = 30000 }) {
  const browser = await playwright.chromium.launch();
  try {
    const shots = [];
    for (const page of pages) {
      for (const size of sizes) {
        const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
        try {
          const p = await context.newPage();
          await p.goto(baseUrl + page, { waitUntil: 'load', timeout: timeoutMs }).catch(() => {});
          await p.waitForTimeout(800);
          const png = await p.screenshot({ type: 'png' });
          shots.push({ page, size: size.name, width: size.width, height: size.height, png: Buffer.from(png) });
        } finally {
          await context.close();
        }
      }
    }
    return shots;
  } finally {
    await browser.close();
  }
}

export async function defaultCapture({ worktree, pages }) {
  const req = createRequire(join(worktree, 'package.json'));
  const playwright = req('@playwright/test');
  const { url, stop } = await serveWorktreeWeb(worktree);
  try {
    return await shootPages({ playwright, baseUrl: url, pages });
  } finally {
    stop();
  }
}
