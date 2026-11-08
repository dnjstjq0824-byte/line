// Frozen PO Master Directive v1.0 contract surface.
//
// These values are pinned by mobile/flutter_app/test/messenger_test.dart.
// Do NOT restyle or renumber: the V3 Harbor design system lives in
// design/v3.dart and uses its own token names. This file only preserves
// the legacy names so existing callers and tests keep compiling.
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const lunoPrimary = Color(0xFF4F7CFF);
const lunoDeepBlue = Color(0xFF315BCD);
const lunoSky = Color(0xFF8EC5FF);
const lunoMint = Color(0xFF5EE6C2);
const lunoNavy = Color(0xFF14213D);
const lunoBg = Color(0xFFF7FAFF);
const lunoSurface = Color(0xFFFFFFFF);
const lunoLightBlue = Color(0xFFEAF1FF);
const lunoMistGray = Color(0xFFD9E1EC);
const lunoSlateGray = Color(0xFF5B6475);
// Canonical aliases kept in step with apps/user-web/src/styles/luno-design-tokens.css
const lunoCloudWhite = Color(0xFFF7FAFF); // --luno-cloud-white
const lunoPureWhite = Color(0xFFFFFFFF); // --luno-pure-white
const lunoElectricBlue = Color(0xFF4F7CFF); // --luno-blue
const lunoSuccessGreen = Color(0xFF22C55E); // --luno-success
const lunoWarningAmber = Color(0xFFF59E0B); // --luno-warning
const lunoErrorRed = Color(0xFFEF4444); // --luno-error

// LUNO Orbit Crew Official Characters (PO Master Directive v1.0)
const lunoOrbitCrewStickers = [
  {'id': 'lumi_hi', 'emoji': '🛸👋', 'label': '안녕!', 'character': 'Lumi'},
  {'id': 'nori_warm', 'emoji': '🪐❤️', 'label': '최고야!', 'character': 'Nori'},
  {'id': 'poko_love', 'emoji': '💫✨', 'label': '반짝여!', 'character': 'Poko'},
  {'id': 'luno_cheer', 'emoji': '🚀🔥', 'label': '화이팅!', 'character': 'Luno'},
  {'id': 'comet_laugh', 'emoji': '☄️😂', 'label': 'ㅋㅋㅋ', 'character': 'Comet'},
  {'id': 'astro_bow', 'emoji': '👨‍🚀🙇', 'label': '감사합니다', 'character': 'Astro'},
];

const lunoReactions = ['❤️', '👍', '😂', '😮', '😢', '🔥'];

const defaultApiBase = 'https://luno-messenger.dnjstjqppk.workers.dev';
const apiBase = String.fromEnvironment('API_URL', defaultValue: defaultApiBase);
const storage = FlutterSecureStorage();
