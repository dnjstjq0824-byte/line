import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { compose } from './parts.mjs';

const samples = [
  ['lumi/wave', { char: 'lumi', eyes: 'happy', mouth: 'laugh', brows: 'happy', blush: 'soft', arms: 'wave', feet: 'stand', caption: '안녕!' }],
  ['nori/cheer', { char: 'nori', eyes: 'happy', mouth: 'laugh', brows: 'happy', blush: 'soft', arms: 'cheer', feet: 'jump', prop: 'starBurst', caption: '야호!' }],
  ['poko/wink', { char: 'poko', eyes: 'wink', mouth: 'tongue', brows: 'raise', blush: 'soft', arms: 'down', feet: 'stand', caption: '히히' }],
  ['luno/thumbs', { char: 'luno', eyes: 'dot', mouth: 'grin', brows: 'happy', arms: 'thumbs', feet: 'stand', fx: 'sparkle', caption: '최고!' }],
  ['comet/star', { char: 'comet', eyes: 'star', mouth: 'smile', brows: 'raise', blush: 'soft', arms: 'cheer', feet: 'jump', fx: 'sparkle', caption: '대박' }],
  ['astro/shock', { char: 'astro', eyes: 'shock', mouth: 'ooh', arms: 'cheer', feet: 'stand', fx: 'impact', caption: '헉!' }],
  ['lumi/sad', { char: 'lumi', eyes: 'sad', mouth: 'sad', brows: 'sad', arms: 'down', feet: 'stand', fx: 'tear', fx2: 'gloom', caption: '흐엉' }],
  ['nori/thanks', { char: 'nori', eyes: 'soft', mouth: 'smile', brows: 'happy', blush: 'soft', arms: 'beg', feet: 'stand', prop: 'envelope', propDy: -22, caption: '고마워' }],
  ['poko/sleep', { char: 'poko', eyes: 'sleepy', mouth: 'flat', arms: 'none', feet: 'none', prop: 'pillow', propDy: -16, fx: 'zzz', fx2: 'night', pose: { dy: 10 }, caption: '쿨쿨' }],
  ['luno/angry', { char: 'luno', eyes: 'angry', mouth: 'yell', brows: 'angry', arms: 'down', feet: 'stand', fx: 'vein', fx2: 'rage', caption: '화나!' }],
  ['comet/love', { char: 'comet', eyes: 'heart', mouth: 'cat', blush: 'strong', arms: 'hug', feet: 'stand', fx: 'hearts', caption: '사랑해' }],
  ['astro/ask', { char: 'astro', eyes: 'dot', mouth: 'flat', brows: 'raise', arms: 'shrug', feet: 'stand', fx: 'question', caption: '음?' }],
];
const cells = samples.map(([label, r]) =>
  `<div style="text-align:center"><div style="font:12px sans-serif;color:#555;margin-bottom:4px">${label}</div>${compose(r)}</div>`).join('');
const html = `<html><body style="margin:0;background:#fff"><div style="display:grid;grid-template-columns:repeat(4,400px)">${cells}</div></body></html>`;
const dir = join(tmpdir(), 'luno-stickers');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'sample.html'), html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1620, height: 1240 } });
await page.goto('file:///' + join(dir, 'sample.html').replace(/\\/g, '/'));
await page.screenshot({ path: join(dir, 'sample.png') });
await browser.close();
console.log('sample at', join(dir, 'sample.png'));
