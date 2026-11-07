import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../apps/shared/design-v3.css', import.meta.url), 'utf8');
function colors(block) { return Object.fromEntries([...block.matchAll(/--ln-([\w-]+):\s*(#[a-f\d]{6})\b/gi)].map(m => [m[1],m[2]])); }
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
}
test('v3 text, controls and muted labels meet AA contrast on both surfaces',()=>{
  const light = colors(source.split(':root[data-theme=dark]')[0]);
  const dark = colors(source.split(':root[data-theme=dark]')[1].split('@media')[0]);
  for(const palette of [light,dark]) for(const [fg,bg] of [['text','surface'],['muted','surface'],['muted','bg'],['on-accent','accent']]) {
    const a=luminance(palette[fg]),b=luminance(palette[bg]);
    const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    assert.ok(ratio>=4.5,`${fg}/${bg}: ${ratio.toFixed(2)}`);
  }
});
test('published v3 token values match the CSS used by applications',async()=>{
  const tokens=JSON.parse(await readFile(new URL('../apps/shared/design-v3.tokens.json',import.meta.url),'utf8'));
  assert.deepEqual(tokens.light,colors(source.split(':root[data-theme=dark]')[0]));
  assert.deepEqual(tokens.dark,colors(source.split(':root[data-theme=dark]')[1].split('@media')[0]));
});
test('v3 radii stay varied and legacy v2 import order is preserved',async()=>{
  const tokens=JSON.parse(await readFile(new URL('../apps/shared/design-v3.tokens.json',import.meta.url),'utf8'));
  const radii=new Set(Object.values(tokens.radiusPx));
  assert.ok(radii.size>=4,'single-radius look forbidden');
  const apps=['user-web','admin-console','partner-console','developer-console','creator-console','ads-console'];
  for(const app of apps){
    const main=await readFile(new URL(`../apps/${app}/src/main.ts`,import.meta.url),'utf8');
    const v2=main.indexOf(`shared/design-v2.css`),v3=main.indexOf('shared/design-v3.css');
    assert.ok(v2>=0 && v3>v2,`${app} must import v3 after v2`);
  }
});
