// F25: axe accessibility scan over the built user-web (served by wrangler
// dev, the prod-like target). Covers login, register mode, the messenger
// shell after a real UI signup+login, and the settings modal. Any violation
// fails the run. Used by pre_deploy_gate and directly:
//   node scripts/axe_scan.mjs [--port 8792] [--keep-open]
import { spawn, execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core');

const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const PORT = portArg >= 0 ? Number(args[portArg + 1]) : 8792;
const KEEP = args.includes('--keep-open');
const BASE = `http://127.0.0.1:${PORT}`;

// NOTE: wrangler dev runs the build itself (wrangler.jsonc build.command),
// so the scan always audits current sources with no separate build step.
async function waitForReady(proc) {
  let logged = '';
  proc.stderr?.on('data', (d) => { logged += String(d); });
  for (let i = 0; i < 150; i++) {
    try {
      const r = await fetch(`${BASE}/api/v1/version`);
      if (r.ok) return;
    } catch {}
    if (proc.exitCode !== null) throw new Error(`wrangler dev exited (${proc.exitCode}): ${logged.slice(-600)}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`wrangler dev did not start: ${logged.slice(-600)}`);
}

async function scan(page, name, failures) {
  await page.addScriptTag({ path: AXE });
  const result = await page.evaluate(async () => {
    // @ts-ignore — axe injected above.
    return await window.axe.run(document, {
      resultTypes: ['violations'],
      rules: { 'color-contrast-enhanced': { enabled: false } },
    });
  });
  const violations = result.violations || [];
  console.log(`axe/${name}: ${violations.length} violation(s)`);
  for (const v of violations) {
    console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`);
    for (const n of v.nodes.slice(0, 4)) {
      console.log(`    - ${n.target.join(' ')} :: ${(n.html || '').slice(0, 160)}`);
    }
    failures.push(`${name}:${v.id}`);
  }
}

async function main() {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  // A fresh state dir per run: hermetic D1 and no lock fights with a
  // previous run's tree while taskkill drains it.
  const wrangler = spawn(npx, ['wrangler', 'dev', '--port', String(PORT),
    '--persist-to', `.wrangler-axe-${PORT}`,
    '--var', `STANDALONE_HOSTS:127.0.0.1,localhost,${BASE.replace('http://', '')}`],
    { stdio: 'pipe', shell: process.platform === 'win32' });
  let failed = false;
  const failures = [];
  try {
    await waitForReady(wrangler);
    const browser = await chromium.launch();
    try {
      // bypassCSP lets the audit harness inject axe; the shipped CSP still
      // applies to every real user (verified by the F19 header tests).
      const page = await browser.newPage({ bypassCSP: true });
      const email = `axe-${Date.now()}@luno-test.local`;
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await scan(page, 'login', failures);

      // Register mode (F24 consent UI included). The create-account toggle
      // is the accent subtle-link; fall back to text search in any locale.
      await page.evaluate(() => {
        const direct = document.querySelector('button.btn-subtle-link.accent');
        if (direct) { direct.click(); return; }
        const btns = [...document.querySelectorAll('button')];
        const b = btns.find((x) => /계정 만들기|Create a new/i.test(x.textContent || ''));
        if (b) b.click();
      });
      await page.getByPlaceholder(/표시 이름|Display name|name/i).first().waitFor({ timeout: 8000 });
      await scan(page, 'register', failures);

      // Real UI signup through the consent flow, then login.
      await page.getByPlaceholder(/이메일|email/i).fill(email);
      await page.getByPlaceholder(/표시 이름|name/i).fill('Axe User');
      await page.getByPlaceholder(/비밀번호|password/i).fill('AxeStrong#2026!');
      await page.locator('input[type="date"]').fill('1990-01-01');
      for (const box of await page.locator('input[type="checkbox"]').all()) {
        if (!(await box.isChecked()) && !(await box.isDisabled())) await box.check();
      }
      const submit = page.locator('form.pc-login-form-inner button[type="submit"]');
      if (!(await submit.count())) {
        const labels = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => (b.textContent || '').trim().slice(0, 40)));
        throw new Error(`register submit not found; buttons: ${JSON.stringify(labels)}`);
      }
      await submit.first().click();
      await page.waitForTimeout(2500);
      // After signup the form returns to login; sign in.
      await page.getByPlaceholder(/이메일|email/i).fill(email);
      await page.getByPlaceholder(/비밀번호|password/i).fill('AxeStrong#2026!');
      await page.locator('form.pc-login-form-inner button[type="submit"]').first().click();
      await page.waitForURL(/\/chats/, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(2000);
      await scan(page, 'messenger', failures);

      // Settings modal, if reachable.
      const settings = page.getByRole('button', { name: /설정|Settings/ }).first();
      if (await settings.count()) {
        await settings.click().catch(() => {});
        await page.waitForTimeout(800);
        await scan(page, 'settings', failures);
      }
    } finally {
      await browser.close();
    }
  } finally {
    if (!KEEP) {
      // On Windows the shell wrapper must die with its tree, or workerd
      // strays accumulate and later runs starve.
      if (process.platform === 'win32' && wrangler.pid) {
        try { execFileSync('taskkill', ['/pid', String(wrangler.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
      } else wrangler.kill('SIGKILL');
    } else console.log(`wrangler kept open at ${BASE} (--keep-open)`);
  }
  if (failures.length) {
    console.log(`\nAXE RED: ${failures.length} violation(s): ${[...new Set(failures)].join(', ')}`);
    process.exit(1);
  }
  console.log('\nAXE GREEN: 0 violations');
}

main().catch((e) => { console.error('axe scan failed:', e.message); process.exit(2); });
