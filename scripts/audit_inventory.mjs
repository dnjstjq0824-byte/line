import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse as parseSfc } from '@vue/compiler-sfc';
import { parse as parseDom } from '@vue/compiler-dom';
const root = process.cwd(), output = path.resolve(process.argv[2] || path.join(root, 'docs/audit-20261105'));
fs.mkdirSync(output, { recursive: true });
const entries = [], routes = [], controls = [], surfaces = [], mobile = [], desktop = [];
const line = (source, index) => source.slice(0, index).split('\n').length;
const files = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  if (['node_modules', 'dist', 'build', '.dart_tool', '.git', 'Pods'].includes(entry.name)) return [];
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? files(file) : [file];
});
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const literalText = node => (node.children || []).map(child => child.type === 2 ? child.content : literalText(child)).join(' ').replace(/\s+/g, ' ').trim();
for (const directory of fs.readdirSync(path.join(root, 'apps'))) {
  const appRoot = path.join(root, 'apps', directory);
  if (!fs.statSync(appRoot).isDirectory()) continue;
  const entry = path.join(appRoot, 'index.html');
  if (fs.existsSync(entry)) entries.push({ app: directory, url: directory === 'user-web' ? '/' : '/' + directory.replace('-console', '') + '/', source: relative(entry) });
  for (const file of files(appRoot).filter(file => /\.(vue|ts)$/.test(file))) {
    const source = fs.readFileSync(file, 'utf8'), resource = relative(file);
    for (const match of source.matchAll(/(['"`])(\/api\/v1\/[^'"`\n]*)\1/g)) routes.push({ kind: 'client-api-expression', app: directory, expression: match[2], source: resource, line: line(source, match.index) });
    if (!file.endsWith('.vue')) continue;
    const template = parseSfc(source).descriptor.template;
    if (!template) continue;
    const visit = node => {
      if (node.type === 1) {
        const props = node.props || [], at = template.loc.start.line + node.loc.start.line - 1;
        const condition = props.find(prop => prop.type === 7 && ['if', 'else-if'].includes(prop.name))?.exp?.content || '';
        const css = props.find(prop => prop.type === 6 && prop.name === 'class')?.value?.content || '';
        if (['main', 'section', 'aside'].includes(node.tag) || /\bpanel\b/.test(css) || /^(activeNav|activeTab|show\w*(Modal|Picker|Panel)|selectedChat|activeProfileUser|selectedOpenChatRoom)/.test(condition)) {
          surfaces.push({ id: `UI-${directory}-${path.basename(file, '.vue')}-${at}-${node.loc.start.column}`, app: directory, kind: 'render-surface', source: resource, line: at, tag: node.tag, condition, classes: css, label: literalText(node).slice(0, 130), status: 'NOT_RUN' });
        }
        if (['button', 'a', 'input', 'select', 'textarea', 'form'].includes(node.tag)) controls.push({ app: directory, tag: node.tag, source: resource, line: at, text: literalText(node).slice(0, 100), bindings: props.filter(prop => prop.type === 7).map(prop => ({ kind: prop.name, argument: prop.arg?.content, expression: prop.exp?.content })) });
      }
      for (const child of node.children || []) visit(child);
    };
    visit(parseDom(template.content));
  }
}
for (const file of files(path.join(root, 'backend/internal/server')).filter(file => file.endsWith('.go') && !file.endsWith('_test.go'))) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/mux\.HandleFunc\("(GET|POST|PUT|PATCH|DELETE) ([^"]+)"\s*,\s*([^\n]+)/g)) routes.push({ kind: 'server-route', method: match[1], expression: match[2], binding: match[3].trim(), source: relative(file), line: line(source, match.index) });
}
const worker = fs.readFileSync(path.join(root, 'scripts/cf_worker.js'), 'utf8');
for (const match of worker.matchAll(/p\.match\((\/\^[^\n]+?)\)/g)) routes.push({ kind: 'worker-route-pattern', expression: match[1], source: 'scripts/cf_worker.js', line: line(worker, match.index) });
for (const match of worker.matchAll(/\bp\s*===\s*(['"])([^'"\n]+)\1/g)) routes.push({ kind: 'worker-route-literal', expression: match[2], source: 'scripts/cf_worker.js', line: line(worker, match.index) });
for (const file of files(path.join(root, 'mobile/flutter_app/lib')).filter(file => file.endsWith('.dart'))) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/class\s+(\w+)\s+extends\s+(StatefulWidget|StatelessWidget|State<[^>]+>)/g)) mobile.push({ kind: 'flutter-class', name: match[1], base: match[2], source: relative(file), line: line(source, match.index), status: 'NOT_RUN' });
  for (const match of source.matchAll(/\bWidget\s+(\w+)\s*\(/g)) mobile.push({ kind: 'flutter-build-method', name: match[1], source: relative(file), line: line(source, match.index), status: 'NOT_RUN' });
}
const desktopRoot = path.join(root, 'desktop');
if (fs.existsSync(desktopRoot)) for (const file of files(desktopRoot).filter(file => /tauri\.conf.*\.json$/.test(file))) desktop.push({ kind: 'desktop-host-config', source: relative(file), content: JSON.parse(fs.readFileSync(file, 'utf8')), status: 'NOT_RUN' });
const cases = [];
const add = data => cases.push({ id: `QA-${String(cases.length + 1).padStart(6, '0')}`, ...data, actual: null, evidence: [], verdict: 'NOT_RUN' });
for (const surface of surfaces) for (const width of [320, 375, 390, 768, 1024, 1440, 1920]) for (const theme of ['light', 'dark']) for (const input of ['pointer', 'keyboard']) {
  for (const locale of surface.app === 'user-web' ? ['ko', 'en', 'th', 'ja'] : ['ko']) add({ category: 'UI', target: surface.id, source: surface.source, purpose: `Render ${surface.id} at ${width}px/${theme}/${locale} with ${input}`, prerequisites: ['Start the real application and backend', 'Authenticate an authorized account and load the data required by the source condition', `Activate source condition: ${surface.condition || 'containing view'}`], steps: [`Set viewport width ${width}px, theme ${theme}, locale ${locale}`, `Reach this surface using ${input}`, 'Inspect layout, focus, control visibility and horizontal overflow; save screenshot'], expected: 'No overlap or page overflow; readable content; reachable controls and visible keyboard focus', dimensions: { width, theme, locale, input } });
}
for (const route of routes.filter(route => route.kind === 'server-route')) for (const principal of ['anonymous', 'expired-session', 'authorized-owner', 'same-role-outsider', 'other-role']) {
  add({ category: 'API-authorization', target: `${route.method} ${route.expression}`, source: route.source, purpose: `Verify ${principal} access to ${route.method} ${route.expression}`, prerequisites: ['Use an isolated real database; do not mutate production', 'Create independent accounts/resources with known ownership', 'Resolve path parameters and determine the documented permission boundary'], steps: [`Send a valid ${route.method} request as ${principal}`, 'Inspect status/body and database before/after', 'Verify that response and side effects match the authenticated ownership/role'], expected: 'Match the documented public/role/ownership policy; unauthorized requests disclose no private data and perform no mutation', dimensions: { principal }, binding: route.binding });
}
const blocked = [
  ['ANDROID-DEVICE', 'Release package installation and actual camera/microphone/background receipt', 'Provision a real Android device and release signing material'],
  ['IOS-DEVICE', 'Xcode build, provisioning, PushKit/CallKit and iPhone execution', 'Provide macOS/Xcode, authorized signing, provisioning and a real iPhone'],
  ['PUSH-PROVIDERS', 'FCM/APNs end-to-end delivery and terminated-app incoming calls', 'Provide approved provider configuration and enrolled real devices'],
  ['STAGING-BACKEND', 'Full production-like API/PostgreSQL/storage/TURN connectivity', 'Identify or provision authorized staging infrastructure and configure its secrets securely'],
];
for (const [target, purpose, action] of blocked) { add({ category: 'external', target, purpose, prerequisites: [action], steps: ['Run on the provisioned environment and record independent evidence'], expected: 'Successful verified end-to-end behavior', requiredAction: action }); cases.at(-1).verdict = 'BLOCKED'; }
const summary = { measuredAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), entries: entries.length, renderSurfaces: surfaces.length, controls: controls.length, serverRoutes: routes.filter(route => route.kind === 'server-route').length, clientApiExpressions: routes.filter(route => route.kind === 'client-api-expression').length, workerPatterns: routes.filter(route => route.kind === 'worker-route-pattern').length, flutterClasses: mobile.length, registryCases: cases.length, targetCases: 5000, counts: { PASS: 0, FAIL: 0, BLOCKED: blocked.length, NOT_RUN: cases.length - blocked.length }, caveat: 'Static extraction is not proof of runtime reachability, a page count, implementation completeness or test execution. Resolve each source condition and authorization expectation before execution. Registry size is not a quality or PASS claim.' };
summary.flutterClasses = mobile.filter(item => item.kind === 'flutter-class').length;
summary.flutterBuildMethods = mobile.filter(item => item.kind === 'flutter-build-method').length;
summary.workerLiteralPaths = routes.filter(item => item.kind === 'worker-route-literal').length;
summary.sourceDirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
fs.writeFileSync(path.join(output, 'inventory.json'), JSON.stringify({ summary, entries, surfaces, routes, controls, mobile, desktop }, null, 2));
if (!process.argv.includes('--inventory-only')) fs.writeFileSync(path.join(output, 'qa-registry.json'), JSON.stringify({ summary, cases }, null, 2));
console.log(JSON.stringify(summary, null, 2));
