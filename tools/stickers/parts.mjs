// LUNO Orbit Crew sticker art system — parametric SVG parts.
//
// Canvas 400x400, transparent. LINE-style: thick navy outlines, flat fills,
// soft shade + shine. Face zone: eyes y=200 (x 165/235), mouth y=255.
// Bodies ~r105 centered (200,215). Parts are data-composed by recipes.mjs.
export const INK = '#22304F';
export const FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif";

const P = (d, attrs = '') => `<path d="${d}" ${attrs}/>`;
const C = (cx, cy, r, fill, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;
const E = (cx, cy, rx, ry, fill, extra = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
const R = (x, y, w, h, rx, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`;
const T = (x, y, size, text, fill = INK, extra = '') =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="800" fill="${fill}" text-anchor="middle" ${extra}>${text}</text>`;
const G = (inner, attrs = '') => `<g ${attrs}>${inner}</g>`;

// ---------------------------------------------------------------- bodies
// Each body: main shape + outline, shade, shine, signature deco. Face drawn
// separately on top.
export const BODIES = {
  lumi: G(
    C(148, 106, 17, '#315BCD', `stroke="${INK}" stroke-width="9"`) +
    C(252, 106, 17, '#315BCD', `stroke="${INK}" stroke-width="9"`) +
    `<line x1="168" y1="122" x2="182" y2="146" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>` +
    `<line x1="232" y1="122" x2="218" y2="146" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>` +
    C(200, 215, 105, '#4F7CFF', `stroke="${INK}" stroke-width="10"`) +
    P('M118 250c8 44 42 72 82 72s74-28 82-72c-24 26-52 36-82 36s-58-10-82-36z', 'fill="#315BCD" opacity="0.45"') +
    E(200, 268, 52, 34, '#DCE7FF', 'opacity="0.85"') +
    E(158, 168, 26, 15, '#FFFFFF', 'opacity="0.5" transform="rotate(-18 158 168)"')
  ),
  nori: G(
    `<line x1="200" y1="112" x2="200" y2="142" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>` +
    P('M200 78l9 17 19 3-14 13 4 19-18-10-18 10 4-19-14-13 19-3z', `fill="#FFD84D" stroke="${INK}" stroke-width="7" stroke-linejoin="round"`) +
    C(200, 215, 105, '#5EE6C2', `stroke="${INK}" stroke-width="10"`) +
    P('M112 246c10 46 44 76 88 76s78-30 88-76c-26 28-56 40-88 40s-62-12-88-40z', 'fill="#2BA98A" opacity="0.5"') +
    E(158, 168, 26, 15, '#FFFFFF', 'opacity="0.55" transform="rotate(-18 158 168)"') +
    P('M128 250l4 8 9 1-6 6 2 9-9-5-9 5 2-9-6-6 9-1z', 'fill="#FFD84D"') +
    P('M264 236l3 7 7 1-5 5 1 7-6-4-7 4 1-7-5-5 8-1z', 'fill="#FFD84D"')
  ),
  poko: G(
    C(140, 140, 34, '#8EC5FF', `stroke="${INK}" stroke-width="10"`) +
    C(200, 120, 40, '#8EC5FF', `stroke="${INK}" stroke-width="10"`) +
    C(260, 140, 34, '#8EC5FF', `stroke="${INK}" stroke-width="10"`) +
    C(200, 220, 100, '#8EC5FF', `stroke="${INK}" stroke-width="10"`) +
    C(200, 220, 100, '#8EC5FF') +
    P('M118 258c10 40 44 66 82 66s72-26 82-66c-24 24-52 34-82 34s-58-10-82-34z', 'fill="#4F7CFF" opacity="0.35"') +
    E(160, 180, 24, 14, '#FFFFFF', 'opacity="0.6" transform="rotate(-18 160 180)"')
  ),
  luno: G(
    P('M168 118c-4-22 8-38 22-44-2 12 2 20 10 26 4-14 16-24 30-26-4 16 0 30 12 40-20 6-56 8-74 4z', `fill="#FF6B35" stroke="${INK}" stroke-width="9" stroke-linejoin="round"`) +
    C(200, 215, 105, '#FF9F43', `stroke="${INK}" stroke-width="10"`) +
    P('M112 246c10 46 44 76 88 76s78-30 88-76c-26 28-56 40-88 40s-62-12-88-40z', 'fill="#D96C1E" opacity="0.55"') +
    E(200, 270, 50, 32, '#FFE3B8', 'opacity="0.8"') +
    E(158, 168, 26, 15, '#FFFFFF', 'opacity="0.5" transform="rotate(-18 158 168)"')
  ),
  comet: G(
    P('M110 190l-26-7 22-13zM102 236l-28 4 26-15zM118 274l-22 16 30-5z', `fill="#C9B8FF" stroke="${INK}" stroke-width="7" stroke-linejoin="round"`) +
    C(210, 215, 102, '#9B7BFF', `stroke="${INK}" stroke-width="10"`) +
    P('M124 246c10 46 42 74 86 74s76-28 86-74c-26 28-54 40-86 40s-60-12-86-40z', 'fill="#6A4BD0" opacity="0.5"') +
    P('M210 128l8 15 17 3-12 12 3 17-16-9-16 9 3-17-12-12 17-3z', `fill="#FFD84D" stroke="${INK}" stroke-width="6" stroke-linejoin="round"`) +
    E(168, 168, 24, 14, '#FFFFFF', 'opacity="0.5" transform="rotate(-18 168 168)"')
  ),
  astro: G(
    C(200, 215, 108, '#FFF6E8', `stroke="${INK}" stroke-width="10"`) +
    C(108, 215, 16, '#B9C6D8', `stroke="${INK}" stroke-width="8"`) +
    C(292, 215, 16, '#B9C6D8', `stroke="${INK}" stroke-width="8"`) +
    R(118, 148, 164, 118, 58, '#BFE3FF', `stroke="${INK}" stroke-width="9"`) +
    P('M140 250c4 5 10 9 18 12l-8 6c-8-4-14-9-18-14z', 'fill="#FFFFFF" opacity="0.7"') +
    E(168, 176, 30, 12, '#FFFFFF', 'opacity="0.65" transform="rotate(-14 168 176)"') +
    C(200, 108, 12, '#FF6B6B', `stroke="${INK}" stroke-width="7"`)
  ),
};

// -- eyes anchor L(165,200) R(235,200) --
const eyeDot = (cx) => C(cx, 200, 13, INK) + C(cx - 4, 196, 4, '#FFFFFF');
const eyeHappy = (cx, f) => P(f ? `M${cx + 13} 202c-6-12-20-12-26 0` : `M${cx - 13} 202c6-12 20-12 26 0`, `stroke="${INK}" stroke-width="9" stroke-linecap="round" fill="none"`);
const eyeSad = (cx, f) => P(f ? `M${cx + 13} 196c-6 12-20 12-26 0` : `M${cx - 13} 196c6 12 20 12 26 0`, `stroke="${INK}" stroke-width="9" stroke-linecap="round" fill="none"`);
const eyeStar = (cx) => P(`M${cx} 184l5 9 10 2-7 7 2 10-10-5-10 5 2-10-7-7 10-2z`, `fill="#FFD84D" stroke="${INK}" stroke-width="5" stroke-linejoin="round"`);
const eyeHeart = (cx) => P(`M${cx} 210c-12-8-16-16-10-23 4-5 10-4 10-4s6-1 10 4c6 7 2 15-10 23z`, `fill="#FF5B7F" stroke="${INK}" stroke-width="5" stroke-linejoin="round"`);
const eyeTear = (cx) => C(cx, 200, 13, INK) + C(cx - 4, 196, 4, '#FFFFFF') + P(`M${cx - 14} 208c-8 14-10 24-4 30 5 5 14 4 16-3 2-8-4-18-12-27z`, `fill="#7CD4FF" stroke="${INK}" stroke-width="5" stroke-linejoin="round"`);
const eyeSleepy = (cx) => P(`M${cx - 12} 200l24 0`, `stroke="${INK}" stroke-width="9" stroke-linecap="round"`);
const eyeAngry = (cx, f) => P(f ? `M${cx - 12} 192l24 14` : `M${cx + 12} 192l-24 14`, `stroke="${INK}" stroke-width="10" stroke-linecap="round"`);
const eyeShock = (cx) => C(cx, 200, 16, '#FFFFFF', `stroke="${INK}" stroke-width="7"`) + C(cx, 200, 6, INK);
const eyeCrazy = (cx) => P(`M${cx - 9} 192l18 16M${cx + 9} 192l-18 16`, `stroke="${INK}" stroke-width="8" stroke-linecap="round"`);

export const EYES = {
  dot: eyeDot(165) + eyeDot(235),
  happy: eyeHappy(165, false) + eyeHappy(235, true),
  sad: eyeSad(165, false) + eyeSad(235, true),
  wink: eyeDot(165) + P('M222 202c6-12 20-12 26 0', `stroke="${INK}" stroke-width="9" stroke-linecap="round" fill="none"`),
  star: eyeStar(165) + eyeStar(235),
  heart: eyeHeart(165) + eyeHeart(235),
  tear: eyeTear(165) + eyeTear(235),
  sleepy: eyeSleepy(165) + eyeSleepy(235),
  angry: eyeAngry(165, false) + eyeAngry(235, true),
  shock: eyeShock(165) + eyeShock(235),
  crazy: eyeCrazy(165) + eyeCrazy(235),
  soft: P('M153 200c6-7 18-7 24 0', `stroke="${INK}" stroke-width="8" stroke-linecap="round" fill="none"`) + P('M223 200c6-7 18-7 24 0', `stroke="${INK}" stroke-width="8" stroke-linecap="round" fill="none"`),
};

export const MOUTHS = {
  smile: P('M172 252c8 14 48 14 56 0', `stroke="${INK}" stroke-width="9" stroke-linecap="round" fill="none"`),
  laugh: P('M168 248c4 26 60 26 64 0-16 8-48 8-64 0z', `fill="#7A2E2E" stroke="${INK}" stroke-width="8" stroke-linejoin="round"`) + P('M182 262c10 8 26 8 36 0-8 10-28 10-36 0z', 'fill="#FF8FA3"'),
  grin: R(172, 244, 56, 26, 13, '#FFFFFF', `stroke="${INK}" stroke-width="8"`) + `<line x1="200" y1="244" x2="200" y2="270" stroke="${INK}" stroke-width="5"/>`,
  sad: P('M172 266c8-14 48-14 56 0', `stroke="${INK}" stroke-width="9" stroke-linecap="round" fill="none"`),
  wail: E(200, 262, 20, 24, '#7A2E2E', `stroke="${INK}" stroke-width="8"`) + E(200, 270, 11, 12, '#FF8FA3'),
  ooh: E(200, 260, 13, 16, '#7A2E2E', `stroke="${INK}" stroke-width="8"`) + C(196, 255, 4, '#FF8FA3'),
  smirk: P('M174 258c14 8 34 6 50-8', `stroke="${INK}" stroke-width="9" stroke-linecap="round" fill="none"`),
  tongue: P('M172 250c10 12 46 12 56 0', `stroke="${INK}" stroke-width="9" stroke-linecap="round" fill="none"`) + P('M192 258c0 14 4 22 12 22s12-8 12-22', `fill="#FF8FA3" stroke="${INK}" stroke-width="7" stroke-linecap="round"`),
  cat: P('M172 254c7-8 15-8 21 0 6-8 14-8 21 0 4-5 9-6 14-5', `stroke="${INK}" stroke-width="8" stroke-linecap="round" fill="none"`),
  flat: P('M178 258h44', `stroke="${INK}" stroke-width="9" stroke-linecap="round"`),
  nervous: P('M174 258l12-6 10 8 10-8 10 8 10-6', `stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"`),
  yell: E(200, 262, 24, 28, '#7A2E2E', `stroke="${INK}" stroke-width="8"`) + E(200, 272, 13, 13, '#FF8FA3'),
};

export const BROWS = {
  none: '',
  happy: P('M148 168c10-8 24-9 34-3M218 165c10-6 24-5 34 3', `stroke="${INK}" stroke-width="8" stroke-linecap="round" fill="none"`),
  sad: P('M148 162c10 6 24 7 34 1M218 163c10 6 24 5 34-1', `stroke="${INK}" stroke-width="8" stroke-linecap="round" fill="none"`),
  angry: P('M146 160l38 14M254 160l-38 14', `stroke="${INK}" stroke-width="10" stroke-linecap="round"`),
  worry: P('M148 170l30-10M252 170l-30-10', `stroke="${INK}" stroke-width="8" stroke-linecap="round"`),
  raise: P('M148 162c12-10 26-10 36-4M226 178c8-2 18-2 26 2', `stroke="${INK}" stroke-width="8" stroke-linecap="round" fill="none"`),
};

export const BLUSH = {
  none: '',
  soft: E(138, 238, 14, 9, '#FF9FB0', 'opacity="0.75"') + E(262, 238, 14, 9, '#FF9FB0', 'opacity="0.75"'),
  strong: E(136, 238, 18, 11, '#FF7D9C', 'opacity="0.85"') + E(264, 238, 18, 11, '#FF7D9C', 'opacity="0.85"'),
};

// ---------------------------------------------------------------- arms
// Stubby mitten arms. Attach L(100,235) R(300,235). Drawn behind body.
const armDown = (x, f) => G(E(x, 268, 17, 30, '#FFFFFF', `stroke="${INK}" stroke-width="9"`) + C(x, 292, 15, '#FFFFFF', `stroke="${INK}" stroke-width="9"`), `transform="rotate(${f ? -14 : 14} ${x} 244)"`);
export const ARMS = {
  none: '',
  down: armDown(96, false) + armDown(304, true),
  wave: armDown(96, false) + G(E(312, 168, 17, 34, '#FFFFFF', `stroke="${INK}" stroke-width="9"`) + C(314, 138, 16, '#FFFFFF', `stroke="${INK}" stroke-width="9"`), 'transform="rotate(18 312 190)"') +
    P('M344 128c6-8 16-10 24-6M350 152c8-6 18-6 26 0', `stroke="${INK}" stroke-width="6" stroke-linecap="round" fill="none"`),
  cheer: G(E(88, 172, 17, 34, '#FFFFFF', `stroke="${INK}" stroke-width="9"`) + C(86, 142, 16, '#FFFFFF', `stroke="${INK}" stroke-width="9"`), 'transform="rotate(-18 88 194)"') +
    G(E(312, 172, 17, 34, '#FFFFFF', `stroke="${INK}" stroke-width="9"`) + C(314, 142, 16, '#FFFFFF', `stroke="${INK}" stroke-width="9"`), 'transform="rotate(18 312 194)"'),
  point: armDown(96, false) + G(R(292, 226, 62, 26, 13, '#FFFFFF', `stroke="${INK}" stroke-width="9"`) + P('M354 232l22 7-22 7z', `fill="#FFFFFF" stroke="${INK}" stroke-width="7" stroke-linejoin="round"`)),
  thumbs: armDown(96, false) + G(R(308, 198, 50, 56, 20, '#FFFFFF', `stroke="${INK}" stroke-width="9"`) + R(322, 144, 26, 66, 13, '#FFFFFF', `stroke="${INK}" stroke-width="9"`) + C(335, 144, 13, '#FFFFFF', `stroke="${INK}" stroke-width="8"`) + P('M320 224c7 5 15 6 22 2M320 238c7 5 15 6 22 2', `stroke="${INK}" stroke-width="5" stroke-linecap="round" fill="none"`), 'transform="rotate(-8 333 220)"'),
  hug: P('M104 250c22 26 60 38 96 38s74-12 96-38', `stroke="#FFFFFF" stroke-width="26" stroke-linecap="round" fill="none"`) +
    P('M104 250c22 26 60 38 96 38s74-12 96-38', `stroke="${INK}" stroke-width="32" stroke-linecap="round" fill="none" opacity="0.18"`) +
    P('M104 250c22 26 60 38 96 38s74-12 96-38', `stroke="${INK}" stroke-width="9" stroke-linecap="round" fill="none" opacity="0.9"`) +
    C(104, 250, 14, '#FFFFFF', `stroke="${INK}" stroke-width="8"`) + C(296, 250, 14, '#FFFFFF', `stroke="${INK}" stroke-width="8"`),
  hold: E(140, 300, 24, 20, '#FFFFFF', `stroke="${INK}" stroke-width="9"`) + E(260, 300, 24, 20, '#FFFFFF', `stroke="${INK}" stroke-width="9"`),
  shrug: G(E(84, 262, 16, 26, '#FFFFFF', `stroke="${INK}" stroke-width="9"`), 'transform="rotate(-24 84 262)"') +
    G(E(316, 262, 16, 26, '#FFFFFF', `stroke="${INK}" stroke-width="9"`), 'transform="rotate(24 316 262)"'),
  beg: E(150, 292, 20, 24, '#FFFFFF', `stroke="${INK}" stroke-width="9"`) + E(250, 292, 20, 24, '#FFFFFF', `stroke="${INK}" stroke-width="9"`) +
    E(200, 296, 26, 20, '#FFFFFF', `stroke="${INK}" stroke-width="9"`),
};

// ---------------------------------------------------------------- feet
export const FEET = {
  stand: E(163, 322, 24, 17, '#FFFFFF', `stroke="${INK}" stroke-width="9"`) + E(237, 322, 24, 17, '#FFFFFF', `stroke="${INK}" stroke-width="9"`),
  jump: G(E(140, 300, 24, 17, '#FFFFFF', `stroke="${INK}" stroke-width="9"`), 'transform="rotate(-24 140 300)"') +
    G(E(260, 300, 24, 17, '#FFFFFF', `stroke="${INK}" stroke-width="9"`), 'transform="rotate(24 260 300)"') +
    P('M120 340h40M240 340h40M160 356h80', `stroke="${INK}" stroke-width="7" stroke-linecap="round"`),
  run: E(140, 316, 26, 16, '#FFFFFF', `stroke="${INK}" stroke-width="9"`) + E(258, 326, 26, 16, '#FFFFFF', `stroke="${INK}" stroke-width="9"`) +
    P('M60 300l34-6M56 326l34-4', `stroke="${INK}" stroke-width="7" stroke-linecap="round"`),
  sit: E(150, 330, 30, 15, '#FFFFFF', `stroke="${INK}" stroke-width="9"`) + E(250, 330, 30, 15, '#FFFFFF', `stroke="${INK}" stroke-width="9"`),
  none: '',
};

// ---------------------------------------------------------------- props
// Hand-held or floating items. Positioned absolute; scale via transform param.
const heart = (x, y, s, fill) => G(P('M0 14c-14-10-19-20-12-29 5-6 12-5 12-5s7-1 12 5c7 9 2 19-12 29z', `fill="${fill}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"`), `transform="translate(${x} ${y}) scale(${s})"`);
const star5 = (x, y, s, fill) => G(P('M0-16l5 10 11 2-8 8 2 11-10-6-10 6 2-11-8-8 11-2z', `fill="${fill}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"`), `transform="translate(${x} ${y}) scale(${s})"`);
export const PROPS = {
  none: '',
  heart: heart(296, 208, 1.6, '#FF5B7F'),
  heartBig: heart(290, 190, 2.4, '#FF5B7F') + heart(108, 150, 1, '#FF8FA3') + heart(330, 140, 0.8, '#FF8FA3'),
  hearts: heart(110, 190, 1.1, '#FF5B7F') + heart(292, 180, 1.4, '#FF5B7F') + heart(180, 120, 0.9, '#FF8FA3') + heart(250, 110, 0.7, '#FF8FA3'),
  gift: G(R(-34, -20, 68, 44, 8, '#FF5B7F', `stroke="${INK}" stroke-width="7"`) + R(-38, -34, 76, 18, 8, '#FF8FA3', `stroke="${INK}" stroke-width="7"`) + R(-8, -34, 16, 58, 4, '#FFD84D', `stroke="${INK}" stroke-width="5"`) + P('M0-34c-12-14-30-10-28 2 10 2 20 0 28-2zM0-34c12-14 30-10 28 2-10 2-20 0-28-2z', `fill="#FFD84D" stroke="${INK}" stroke-width="5" stroke-linejoin="round"`), 'transform="translate(200 300)"'),
  cake: G(E(0, 18, 44, 14, '#FFFFFF', `stroke="${INK}" stroke-width="7"`) + R(-40, -22, 80, 44, 10, '#FF9FB0', `stroke="${INK}" stroke-width="7"`) + P('M-40-6c8-8 16 4 24-4s16 4 24-4 16 4 24-4v14H-40z', 'fill="#FFFFFF"') + R(-4, -52, 8, 32, 4, '#FFD84D', `stroke="${INK}" stroke-width="5"`) + P('M0-66c-6 8-6 14 0 18 6-4 6-10 0-18z', `fill="#FF8A3D" stroke="${INK}" stroke-width="4" stroke-linejoin="round"`), 'transform="translate(200 296)"'),
  bouquet: G(P('M0 50L-30 0h60z', `fill="#BFE3FF" stroke="${INK}" stroke-width="7" stroke-linejoin="round"`) + C(-14, -12, 12, '#FF5B7F', `stroke="${INK}" stroke-width="6"`) + C(12, -16, 13, '#FF8FA3', `stroke="${INK}" stroke-width="6"`) + C(0, 2, 12, '#FFD84D', `stroke="${INK}" stroke-width="6"`) + C(0, 26, 8, '#FF5B7F', `stroke="${INK}" stroke-width="5"`), 'transform="translate(292 250)"'),
  phone: G(R(-24, -40, 48, 80, 12, '#22304F') + R(-18, -32, 36, 60, 8, '#BFE3FF') + P('M-10-8l6 8 12-14', `stroke="#2BA98A" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"`) + C(0, 34, 4, '#8EC5FF'), 'transform="translate(300 240) rotate(12)"'),
  coffee: G(R(-20, -28, 40, 56, 8, '#FFFFFF', `stroke="${INK}" stroke-width="7"`) + P('M20-14c14 0 14 26 0 26', `stroke="${INK}" stroke-width="7" stroke-linecap="round" fill="none"`) + R(-20, -28, 40, 12, 6, '#C98A5B') + P('M-8-40c-4-6 4-8 0-14M8-40c-4-6 4-8 0-14', `stroke="#8EC5FF" stroke-width="5" stroke-linecap="round" fill="none"`), 'transform="translate(296 260)"'),
  star: star5(300, 200, 1.6, '#FFD84D'),
  starBurst: star5(96, 150, 1.2, '#FFD84D') + star5(306, 140, 1.5, '#FFD84D') + star5(338, 220, 0.9, '#FFD84D') + star5(66, 230, 0.9, '#FFD84D') + C(120, 90, 6, '#FFD84D', `stroke="${INK}" stroke-width="3"`) + C(282, 84, 6, '#FFD84D', `stroke="${INK}" stroke-width="3"`),
  confetti: P('M70 120l14 8M330 120l-14 8M60 200l16 2M340 200l-16 2M80 290l12-8M320 290l-12-8', `stroke="#FF5B7F" stroke-width="7" stroke-linecap="round"`) + C(110, 90, 7, '#4F7CFF') + C(290, 88, 7, '#2BA98A') + C(350, 260, 7, '#FFD84D') + C(50, 260, 7, '#9B7BFF') + R(126, 130, 14, 14, 3, '#5EE6C2', `stroke="${INK}" stroke-width="4"`) + R(262, 268, 14, 14, 3, '#FF9F43', `stroke="${INK}" stroke-width="4"`),
  balloon: G(E(0, -20, 30, 38, '#FF5B7F', `stroke="${INK}" stroke-width="7"`) + P('M0 18c-6 10 6 14 0 26', `stroke="${INK}" stroke-width="5" stroke-linecap="round" fill="none"`) + E(-10, -32, 8, 12, '#FFFFFF', 'opacity="0.6"'), 'transform="translate(310 190)"'),
  envelope: G(R(-34, -22, 68, 44, 8, '#FFFFFF', `stroke="${INK}" stroke-width="7"`) + P('M-34-22l34 26 34-26', `stroke="${INK}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"`) + heart(0, -34, 0.8, '#FF5B7F'), 'transform="translate(200 300)"'),
  umbrella: G(P('M-52 0a52 52 0 0 1 104 0c-10-6-20 2-30-4s-16 2-26-2-16 2-24-2-14 2-24 8z', `fill="#4F7CFF" stroke="${INK}" stroke-width="7" stroke-linejoin="round"`) + `<line x1="0" y1="0" x2="0" y2="66" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>` + P('M0 66c0 10-16 12-20 4', `stroke="${INK}" stroke-width="8" stroke-linecap="round" fill="none"`), 'transform="translate(200 118)"'),
  pillow: G(R(-52, -26, 104, 52, 22, '#FFFFFF', `stroke="${INK}" stroke-width="8"`) + R(-52, -26, 104, 16, 8, '#DCE7FF'), 'transform="translate(200 308)"'),
  thermo: G(R(-9, -44, 18, 66, 9, '#FFFFFF', `stroke="${INK}" stroke-width="7"`) + C(0, 32, 17, '#FF5B5B', `stroke="${INK}" stroke-width="7"`) + R(-4, -20, 8, 44, 4, '#FF5B5B'), 'transform="translate(306 220) rotate(18)"'),
  bandage: G(R(-34, -14, 68, 28, 14, '#F5D7A8', `stroke="${INK}" stroke-width="6"`) + C(-6, 0, 3, '#D89B5F') + C(6, 0, 3, '#D89B5F'), 'transform="translate(200 132) rotate(-8)"'),
  mega: G(P('M-30-26l56-14 4 64-56-6z', `fill="#FFD84D" stroke="${INK}" stroke-width="7" stroke-linejoin="round"`) + R(-44, -12, 18, 30, 6, '#22304F') + P('M40-30l18-8M42-8l18 2M40 14l16 10', `stroke="${INK}" stroke-width="6" stroke-linecap="round"`), 'transform="translate(296 210)"'),
  clock: G(C(0, 0, 34, '#FFFFFF', `stroke="${INK}" stroke-width="8"`) + `<line x1="0" y1="0" x2="0" y2="-22" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>` + `<line x1="0" y1="0" x2="14" y2="8" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`, 'transform="translate(306 160)"'),
  clover: G(C(-11, -6, 13, '#2BA98A', `stroke="${INK}" stroke-width="6"`) + C(11, -6, 13, '#2BA98A', `stroke="${INK}" stroke-width="6"`) + C(0, 12, 13, '#2BA98A', `stroke="${INK}" stroke-width="6"`) + P('M0 22c2 10-4 16-12 18', `stroke="${INK}" stroke-width="6" stroke-linecap="round" fill="none"`), 'transform="translate(300 220)"'),
  cookie: G(C(0, 0, 30, '#D89B5F', `stroke="${INK}" stroke-width="7"`) + C(-10, -6, 4, '#5B3319') + C(8, 4, 4, '#5B3319') + C(-2, 12, 4, '#5B3319') + P('M14-22a30 30 0 0 1 14 12l-12 6z', `fill="#D89B5F" stroke="${INK}" stroke-width="6" stroke-linejoin="round"`), 'transform="translate(298 250)"'),
  mic: G(R(-14, -46, 28, 52, 14, '#9B7BFF', `stroke="${INK}" stroke-width="7"`) + P('M-24-14v10a24 24 0 0 0 48 0v-10', `stroke="${INK}" stroke-width="7" stroke-linecap="round" fill="none"`) + `<line x1="0" y1="22" x2="0" y2="40" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>` + P('M-16 40h32', `stroke="${INK}" stroke-width="7" stroke-linecap="round"`), 'transform="translate(300 230)"'),
  dumbbell: G(R(-46, -12, 92, 24, 12, '#22304F') + R(-58, -24, 20, 48, 8, '#8EC5FF', `stroke="${INK}" stroke-width="6"`) + R(38, -24, 20, 48, 8, '#8EC5FF', `stroke="${INK}" stroke-width="6"`) + R(-70, -16, 12, 32, 6, '#8EC5FF', `stroke="${INK}" stroke-width="6"`) + R(58, -16, 12, 32, 6, '#8EC5FF', `stroke="${INK}" stroke-width="6"`), 'transform="translate(200 310)"'),
  trophy: G(P('M-22-30h44v24c0 18-10 28-22 28s-22-10-22-28z', `fill="#FFD84D" stroke="${INK}" stroke-width="7" stroke-linejoin="round"`) + P('M-22-24c-14 0-18 20-6 26M22-24c14 0 18 20 6 26', `stroke="${INK}" stroke-width="6" stroke-linecap="round" fill="none"`) + R(-8, 22, 16, 12, 4, '#B8860B', `stroke="${INK}" stroke-width="5"`) + R(-20, 34, 40, 10, 5, '#B8860B', `stroke="${INK}" stroke-width="5"`), 'transform="translate(296 240)"'),
};

// ---------------------------------------------------------------- fx2 (scenes & caption)
export const FX2 = {
  none: '',
  tearFall: P('M118 224c-4 26-2 52 6 74M282 224c4 26 2 52-6 74', `stroke="#7CD4FF" stroke-width="13" stroke-linecap="round" fill="none"`),
  puddle: E(200, 348, 100, 15, '#7CD4FF', 'opacity="0.5"'),
  rage: P('M52 160l40 14M52 240l40-14M348 160l-40 14M348 240l-40-14', `stroke="#FF5B5B" stroke-width="9" stroke-linecap="round"`) + P('M200 60c26 8 44 26 52 52-22-12-44-14-66-8 6-16 10-30 14-44z', `fill="#FF5B5B" stroke="${INK}" stroke-width="6" stroke-linejoin="round"`),
  night: C(84, 90, 26, '#FFD84D', `stroke="${INK}" stroke-width="7"`) + C(320, 84, 5, '#FFFFFF') + C(348, 130, 4, '#FFFFFF') + C(56, 150, 4, '#FFFFFF') + P('M296 60l3 7 8 2-6 5 2 8-7-4-7 4 2-8-6-5 8-2z', `fill="#FFFFFF"`),
  rain: P('M80 90l-10 24M130 80l-10 24M270 80l-10 24M320 90l-10 24', `stroke="#7CD4FF" stroke-width="9" stroke-linecap="round"`) + E(200, 352, 110, 13, '#7CD4FF', 'opacity="0.4"'),
  sunburst: G(Array.from({ length: 12 }, (_, i) => { const a = (i * 30 * Math.PI) / 180; const x1 = 200 + Math.cos(a) * 140; const y1 = 200 + Math.sin(a) * 140; const x2 = 200 + Math.cos(a) * 168; const y2 = 200 + Math.sin(a) * 168; return `<line x1="${x1.toFixed(0)}" y1="${y1.toFixed(0)}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="#FFD84D" stroke-width="10" stroke-linecap="round"/>`; }).join('')),
};

// ---------------------------------------------------------------- fx
const dropFx = (x, y, s, fill) => P(`M${x} ${y - 16 * s}c${-10 * s} ${12 * s} ${-13 * s} ${20 * s} ${-6 * s} ${27 * s}c${5 * s} ${6 * s} ${15 * s} ${4 * s} ${17 * s} ${-4 * s}c${2 * s} ${-8 * s} ${-2 * s} ${-18 * s} ${-5 * s} ${-23 * s}z`, `fill="${fill}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"`);
export const FX = {
  none: '',
  tear: dropFx(120, 250, 1.1, '#7CD4FF') + dropFx(280, 250, 1.1, '#7CD4FF'),
  sweat: dropFx(292, 168, 1, '#7CD4FF') + dropFx(108, 150, 0.7, '#7CD4FF'),
  vein: P('M262 132c8-10 22-10 28 0 8-8 22-8 28 2-2 10-12 14-20 12 0 8-8 14-18 12-8-2-14-10-12-18-8 0-16-4-16-8z', `fill="#FF5B5B" stroke="${INK}" stroke-width="6" stroke-linejoin="round"`),
  sparkle: P('M84 120l5 11 12 2-8 8 2 12-11-6-11 6 2-12-8-8 12-2z', `fill="#FFD84D" stroke="${INK}" stroke-width="4" stroke-linejoin="round"`) + P('M312 108l4 9 10 2-7 7 2 10-9-5-9 5 2-10-7-7 10-2z', `fill="#FFD84D" stroke="${INK}" stroke-width="4" stroke-linejoin="round"`) + C(336, 160, 5, '#FFD84D', `stroke="${INK}" stroke-width="3"`) + C(62, 168, 5, '#FFD84D', `stroke="${INK}" stroke-width="3"`),
  impact: P('M60 200h36M304 200h36M84 130l26 22M316 130l-26 22M84 290l26-22M316 290l-26-22', `stroke="${INK}" stroke-width="8" stroke-linecap="round"`),
  gloom: P('M120 96l-8 22M160 88l-6 22M240 88l6 22M280 96l8 22', `stroke="#5B6475" stroke-width="9" stroke-linecap="round"`) + E(200, 330, 90, 16, '#5B6475', 'opacity="0.25"'),
  question: T(322, 130, 64, '?', '#315BCD') + C(322, 132, 30, 'none', `stroke="${INK}" stroke-width="4"`),
  exclaim: R(308, 56, 28, 48, 14, '#FF5B5B', `stroke="${INK}" stroke-width="7"`) + C(322, 122, 9, '#FF5B5B', `stroke="${INK}" stroke-width="6"`),
  zzz: T(296, 120, 40, 'Z', '#315BCD') + T(322, 92, 30, 'Z', '#315BCD') + T(342, 70, 22, 'Z', '#315BCD'),
  music: T(88, 150, 44, '♪', '#315BCD') + T(318, 220, 36, '♫', '#FF5B7F') + T(96, 280, 32, '♩', '#2BA98A'),
  hearts: heart(110, 190, 1.1, '#FF5B7F') + heart(292, 180, 1.4, '#FF5B7F') + heart(180, 118, 0.9, '#FF8FA3') + heart(250, 108, 0.7, '#FF8FA3'),
};

// Caption chip. pos: 'top' | 'bottom'. Auto width from text length.
export function caption(text, pos = 'bottom', bg = '#FFFFFF') {
  if (!text) return '';
  const fs = 34;
  const w = Math.min(360, [...text].reduce((n, ch) => n + (/[\x00-\x7F]/.test(ch) ? 0.58 : 1.02), 0) * fs + 44);
  const y = pos === 'top' ? 30 : 318;
  return G(R(200 - w / 2, y, w, 52, 26, bg, `stroke="${INK}" stroke-width="7"`) + T(200, y + 38, fs, text), '');
}

// ---------------------------------------------------------------- compose
// Layer order: fxBack, feet, arms(behind), body, face, armsFront?, prop, fx,
// caption. Pose transform applies to the character group.
const FRONT_ARMS = new Set(['hug', 'hold', 'beg']);
export function compose(r) {
  const eye = EYES[r.eyes] ?? EYES.dot;
  const mouth = MOUTHS[r.mouth] ?? MOUTHS.smile;
  const brow = BROWS[r.brows || 'none'] ?? '';
  const blush = BLUSH[r.blush || 'none'] ?? '';
  const arms = ARMS[r.arms || 'down'] ?? '';
  const feet = FEET[r.feet || 'stand'] ?? '';
  const prop = G(PROPS[r.prop || 'none'] ?? '', `transform="translate(${r.propDx || 0} ${r.propDy || 0})"`);
  const fx = (FX[r.fx || 'none'] ?? '') + (FX2[r.fx2 || 'none'] ?? '');
  const body = BODIES[r.char] ?? BODIES.lumi;
  const t = r.pose || {};
  const autoDy = (r.caption && r.captionPos !== 'top' && !t.dy) ? -14 : 0;
  const xf = `translate(${t.dx || 0} ${(t.dy || 0) + autoDy}) rotate(${t.rot || 0} 200 215)`;
  const behindArms = FRONT_ARMS.has(r.arms) ? '' : arms;
  const frontArms = FRONT_ARMS.has(r.arms) ? arms : '';
  const char = G(feet + behindArms + body + brow + blush + eye + mouth + frontArms, `transform="${xf}"`);
  const inner = (r.fxBack || '') + char + prop + fx + caption(r.caption, r.captionPos, r.captionBg);
  return `<svg viewBox="0 0 400 400" width="400" height="400" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}
