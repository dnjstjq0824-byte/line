import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../apps/shared/design-v2.css', import.meta.url), 'utf8');
function colors(block) { return Object.fromEntries([...block.matchAll(/--ln-([\w-]+):\s*(#[a-f\d]{6})\b/gi)].map(m => [m[1],m[2]])); }
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
}
test('v2 text, controls and muted labels meet AA contrast on both surfaces',()=>{
  const light = colors(source.split(':root[data-theme=dark]')[0]);
  const dark = colors(source.split(':root[data-theme=dark]')[1].split('@media')[0]);
  for(const palette of [light,dark]) for(const [fg,bg] of [['text','surface'],['muted','surface'],['muted','bg'],['on-accent','accent']]) {
    const a=luminance(palette[fg]),b=luminance(palette[bg]);
    const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    assert.ok(ratio>=4.5,`${fg}/${bg}: ${ratio.toFixed(2)}`);
  }
});
test('canonical ko/en resources retain the complete 169-key handoff',async()=>{
  const [ko,en,design] = await Promise.all(['ko.json','en.json','design-v2.json'].map(p=>readFile(new URL('../apps/shared/strings/'+p,import.meta.url),'utf8').then(JSON.parse)));
  assert.equal(Object.keys(ko).length,169);
  assert.deepEqual(Object.keys(ko).sort(),Object.keys(en).sort());
  assert.deepEqual(Object.keys(design.ko).sort(),Object.keys(design.en).sort());
  for(const dict of [ko,en,design.ko,design.en]) assert.ok(Object.values(dict).every(s=>typeof s==='string' && s.trim().length>0));
});
test('published v2 token values match the CSS used by applications',async()=>{
  const tokens=JSON.parse(await readFile(new URL('../apps/shared/design-v2.tokens.json',import.meta.url),'utf8'));
  assert.deepEqual(tokens.light,colors(source.split(':root[data-theme=dark]')[0]));
  assert.deepEqual(tokens.dark,colors(source.split(':root[data-theme=dark]')[1].split('@media')[0]));
});
