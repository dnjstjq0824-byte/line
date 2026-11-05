import fs from 'fs';
import path from 'path';

const file = path.resolve('scripts/cf_worker.js');
let code = fs.readFileSync(file, 'utf8');

// 1. Move richMenus & add oaBotRules at top
if (!code.includes('const oaBotRules = new Map();')) {
  code = code.replace(
    'const partnerCampaigns = new Map();',
    'const partnerCampaigns = new Map();\r\nconst richMenus = new Map();\r\nconst oaBotRules = new Map();'
  );
  // remove old duplicate at ~1063
  code = code.replace(/const richMenus = new Map\(\);\r?\n/, '');
}

// 2. Update botReply
const oldBotReply = `function botReply(text, account) {
  const t = String(text || '').toLowerCase();
  if (/안녕|hello|hi\\b/.test(t)) return \`안녕하세요! \${account.name} 공식계정입니다. 👋 '도움말'이라고 입력해 보세요.\`;
  if (/도움|help/.test(t)) return '사용 가능한 명령: 안녕, 날씨, 쿠폰, 공지, 도움말';
  if (/날씨|weather/.test(t)) return '오늘 서울은 맑음 ☀️ 최고 21°C / 최저 12°C 입니다.';
  if (/쿠폰|coupon/.test(t)) return '🎟️ 신규 친구 10% 할인 쿠폰: WELCOME10';
  if (/공지|notice/.test(t)) return '📢 이번 주 업데이트: 타임라인·VOOM·Pay 기능이 추가되었습니다.';
  return '메시지를 받았습니다. 자세한 안내는 "도움말"을 입력해 주세요.';
}`;

const newBotReply = `function botReply(text, account) {
  const t = String(text || '').toLowerCase();
  const rules = (typeof oaBotRules !== 'undefined' && oaBotRules.get(account.id)) || [];
  for (const r of rules) {
    if (r.keywords && r.keywords.some(kw => t.includes(String(kw).toLowerCase()))) {
      return r.reply;
    }
  }
  if (/안녕|hello|hi\\b/.test(t)) return \`안녕하세요! \${account.name} 공식계정입니다. 👋 하단 리치 메뉴를 누르시거나 '도움말'을 입력해 보세요.\`;
  if (/도움|help/.test(t)) return '사용 가능한 안내: 공지사항, 고객센터, 보안 안내, 이벤트, 날씨, 쿠폰, 특가, 페이 혜택';
  if (/날씨|weather/.test(t)) return '오늘 서울은 맑음 ☀️ 최고 21°C / 최저 12°C 입니다.';
  if (/쿠폰|coupon/.test(t)) return '🎟️ 신규 친구 10% 할인 쿠폰: WELCOME10';
  if (/공지|notice/.test(t)) return '📢 이번 주 업데이트: 타임라인·VOOM·Pay 기능 및 공식계정 리치메뉴가 추가되었습니다.';
  return '메시지를 전달받았습니다. 하단 리치 메뉴 버튼을 누르시거나 "도움말"을 입력해 보세요. 🤖';
}`;

if (code.includes('if (/안녕|hello|hi\\b/.test(t)) return `안녕하세요! ${account.name} 공식계정입니다.')) {
  code = code.replace(oldBotReply.replace(/\r?\n/g, '\r\n'), newBotReply.replace(/\r?\n/g, '\r\n'));
}

// 3. Seed default rich menus and bot rules in seedExtras
const seedTarget = `  for (const [id, name, handle, description, color] of [
    ['oa-notice', 'LUNO 공식 안내', '@luno_notice', 'LUNO 서비스 소식과 업데이트를 전해드립니다.', '#315BCD'],
    ['oa-weather', '날씨 알리미', '@weather', '매일 아침 날씨를 알려드립니다.', '#0ea5e9'],
    ['oa-deals', '오늘의 특가', '@deals', '친구 전용 쿠폰과 특가 소식', '#f43f5e']
  ]) officialAccounts.set(id, { id, name, handle, description, color });`;

const seedAdditions = `  for (const [id, name, handle, description, color] of [
    ['oa-notice', 'LUNO 공식 안내', '@luno_notice', 'LUNO 서비스 소식과 업데이트를 전해드립니다.', '#315BCD'],
    ['oa-weather', '날씨 알리미', '@weather', '매일 아침 날씨를 알려드립니다.', '#0ea5e9'],
    ['oa-deals', '오늘의 특가', '@deals', '친구 전용 쿠폰과 특가 소식', '#f43f5e']
  ]) officialAccounts.set(id, { id, name, handle, description, color });

  // Default Rich Menus for Official Accounts
  richMenus.set('oa-notice', {
    id: 'menu_oa-notice',
    account_id: 'oa-notice',
    title: 'LUNO 공식 안내 종합 메뉴',
    layout: 'grid_2x3',
    tiles: [
      { id: 't1', label: '📢 최신 공지', icon: '📢', action: { type: 'message', text: '공지사항' } },
      { id: 't2', label: '💬 고객센터 상담', icon: '💬', action: { type: 'message', text: '상담' } },
      { id: 't3', label: '🔒 보안 가이드', icon: '🔒', action: { type: 'message', text: '보안 안내' } },
      { id: 't4', label: '🎁 진행중 이벤트', icon: '🎁', action: { type: 'message', text: '이벤트' } },
      { id: 't5', label: '⚡ 신규 기능 안내', icon: '⚡', action: { type: 'message', text: '신규 기능' } },
      { id: 't6', label: '🌐 공식 웹사이트', icon: '🌐', action: { type: 'uri', uri: 'https://line-messenger.dnjstjqppk.workers.dev' } }
    ]
  });

  richMenus.set('oa-weather', {
    id: 'menu_oa-weather',
    account_id: 'oa-weather',
    title: '날씨 알리미 퀵 메뉴',
    layout: 'grid_1x3',
    tiles: [
      { id: 'tw1', label: '☀️ 오늘 날씨', icon: '☀️', action: { type: 'message', text: '오늘 날씨' } },
      { id: 'tw2', label: '🌧️ 주간 예보', icon: '🌧️', action: { type: 'message', text: '주간 예보' } },
      { id: 'tw3', label: '😷 미세먼지', icon: '😷', action: { type: 'message', text: '미세먼지' } }
    ]
  });

  richMenus.set('oa-deals', {
    id: 'menu_oa-deals',
    account_id: 'oa-deals',
    title: '특가 & 혜택 퀵 메뉴',
    layout: 'grid_1x3',
    tiles: [
      { id: 'td1', label: '🎟️ 할인 쿠폰', icon: '🎟️', action: { type: 'message', text: '쿠폰' } },
      { id: 'td2', label: '🔥 오늘의 특가', icon: '🔥', action: { type: 'message', text: '특가' } },
      { id: 'td3', label: '💳 페이 혜택', icon: '💳', action: { type: 'message', text: '페이 혜택' } }
    ]
  });

  // Default Chatbot Keyword Auto-Reply Rules
  oaBotRules.set('oa-notice', [
    { id: 'r_n1', keywords: ['공지', '공지사항'], reply: '📢 [LUNO 공지] v2.0.0 업데이트가 완료되었습니다.\\n• 세션 보안 강화 및 원격 로그아웃\\n• 13종 메시지 클라우드 영속성 보장\\n• 공식계정 리치 메뉴 및 챗봇 자동응답 릴리스' },
    { id: 'r_n2', keywords: ['상담', '고객센터', '문의'], reply: '💬 [고객센터] 문의 사항을 남겨주시면 담당 상담원이 순차적으로 답변을 드립니다.\\n• 운영 시간: 평일 09:00 ~ 18:00 (주말/공휴일 휴무)' },
    { id: 'r_n3', keywords: ['보안', '해킹', '비밀번호'], reply: '🔒 [보안 센터] LUNO는 2단계 기기 인증과 원격 세션 즉시 실효화(Revocation) 기능을 제공합니다. 의심스러운 로그인은 설정 > 활성 기기 관리에서 즉시 종료할 수 있습니다.' },
    { id: 'r_n4', keywords: ['이벤트', '혜택'], reply: '🎁 [이벤트 안내] 신규 친구 등록 시 1,000 LUNO Pay 포인트 즉시 적립! 친구 초대 링크를 공유해보세요.' },
    { id: 'r_n5', keywords: ['신규', '기능', '업데이트'], reply: '⚡ [신규 기능] 6개 웹 포털(Admin, Partner, Developer, Creator, Ads), 공식 계정 인터랙티브 리치 메뉴가 활성화되었습니다.' }
  ]);

  oaBotRules.set('oa-weather', [
    { id: 'r_w1', keywords: ['오늘', '날씨'], reply: '☀️ [오늘 날씨] 서울: 맑음 21°C / 부산: 구름조금 23°C / 제주: 맑음 22°C (강수확률 10%). 기분 좋은 화창한 하루입니다.' },
    { id: 'r_w2', keywords: ['주간', '예보'], reply: '🌧️ [주간 예보] 이번 주 목요일 오후 전국 비 소식이 있습니다. 외출 시 우산을 준비하세요!' },
    { id: 'r_w3', keywords: ['미세먼지', '공기', '황사'], reply: '😷 [대기질 예보] 미세먼지: 좋음 (18㎍/㎥) / 초미세먼지: 좋음 (9㎍/㎥). 환기와 야외 활동에 적합합니다.' }
  ]);

  oaBotRules.set('oa-deals', [
    { id: 'r_d1', keywords: ['쿠폰', '할인'], reply: '🎟️ [전용 쿠폰 발급] 코드: LUNO-SUPER-2026 (결제 시 15% 즉시 할인 적용)' },
    { id: 'r_d2', keywords: ['특가', '상품', '쇼핑'], reply: '🔥 [오늘의 특가] 프리미엄 무선 노이즈캔슬링 헤드폰 45% 파격 할인 진행 중! (선착순 100명)' },
    { id: 'r_d3', keywords: ['페이', '혜택'], reply: '💳 [LUNO Pay 혜택] LUNO Pay로 결제 시 전 가맹점 3% 무제한 캐시백 적립 혜택을 드립니다.' }
  ]);`;

if (code.includes('officialAccounts.set(id, { id, name, handle, description, color });') && !code.includes("richMenus.set('oa-notice'")) {
  code = code.replace(seedTarget.replace(/\r?\n/g, '\r\n'), seedAdditions.replace(/\r?\n/g, '\r\n'));
}

// 4. Add conversations/:cid/rich-menu in extended()
const richMenuRouteAnchor = `  if ((m = p.match(/^conversations\\/([\\w-]+)\\/typing$/)) && method === 'POST') {
    broadcast({ type: 'conversation.typing', conversation_id: m[1], user_id: myId });
    return json({ status: 'typing' });
  }`;

const richMenuRouteReplacement = `  if ((m = p.match(/^conversations\\/([\\w-]+)\\/typing$/)) && method === 'POST') {
    broadcast({ type: 'conversation.typing', conversation_id: m[1], user_id: myId });
    return json({ status: 'typing' });
  }
  if ((m = p.match(/^conversations\\/([\\w-]+)\\/rich-menu$/)) && method === 'GET') {
    const cid = resolveConversationId(m[1], myId);
    const conv = conversations.get(cid);
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없거나 접근 권한이 없습니다', 404);
    const oaId = conv.members.find(x => officialAccounts.has(x) || richMenus.has(x));
    if (!oaId) return json({ rich_menu: null });
    const menu = richMenus.get(oaId) || null;
    return json({ rich_menu: menu });
  }`;

if (code.includes("p.match(/^conversations\\/([\\w-]+)\\/typing$/)") && !code.includes("p.match(/^conversations\\/([\\w-]+)\\/rich-menu$/)")) {
  code = code.replace(richMenuRouteAnchor.replace(/\r?\n/g, '\r\n'), richMenuRouteReplacement.replace(/\r?\n/g, '\r\n'));
}

// 5. Update partner/accounts/:id/rich-menus and add bot-rules
const oldPartnerRichMenu = `  if ((m = p.match(/^partner\\/accounts\\/([\\w-]+)\\/rich-menus$/))) {
    const aid = m[1];
    if (method === 'GET') {
      const menu = richMenus.get(aid) || {
        id: \`menu_\${aid}\`,
        account_id: aid,
        size: { width: 1200, height: 800 },
        areas: [
          { bounds: { x: 0, y: 0, width: 400, height: 400 }, action: { type: 'message', text: '공식 공지사항' } },
          { bounds: { x: 400, y: 0, width: 400, height: 400 }, action: { type: 'message', text: '고객센터 상담' } },
          { bounds: { x: 800, y: 0, width: 400, height: 400 }, action: { type: 'uri', uri: 'https://line-messenger.dnjstjqppk.workers.dev' } },
          { bounds: { x: 0, y: 400, width: 600, height: 400 }, action: { type: 'message', text: '진행중 이벤트' } },
          { bounds: { x: 600, y: 400, width: 600, height: 400 }, action: { type: 'message', text: '자주 묻는 질문' } }
        ]
      };
      return json({ rich_menu: menu });
    }
    if (method === 'POST') {
      const b = await readJson(request);
      const menu = { id: uid(), account_id: aid, ...b, updated_at: now() };
      richMenus.set(aid, menu);
      return json(menu, 201);
    }
  }`;

const newPartnerRichMenu = `  if ((m = p.match(/^partner\\/accounts\\/([\\w-]+)\\/rich-menus$/))) {
    const aid = m[1];
    if (method === 'GET') {
      const menu = richMenus.get(aid) || {
        id: \`menu_\${aid}\`,
        account_id: aid,
        title: '공식 채널 기본 메뉴',
        layout: 'grid_2x3',
        tiles: [
          { id: 't1', label: '📢 공식 공지', icon: '📢', action: { type: 'message', text: '공지사항' } },
          { id: 't2', label: '💬 고객센터 상담', icon: '💬', action: { type: 'message', text: '상담' } },
          { id: 't3', label: '🌐 공식 웹사이트', icon: '🌐', action: { type: 'uri', uri: 'https://line-messenger.dnjstjqppk.workers.dev' } },
          { id: 't4', label: '🎁 진행중 이벤트', icon: '🎁', action: { type: 'message', text: '이벤트' } },
          { id: 't5', label: '❓ 자주 묻는 질문', icon: '❓', action: { type: 'message', text: '도움말' } },
          { id: 't6', label: '💳 LUNO Pay 혜택', icon: '💳', action: { type: 'message', text: '쿠폰' } }
        ]
      };
      return json({ rich_menu: menu });
    }
    if (method === 'POST') {
      const b = await readJson(request);
      const menu = { id: uid(), account_id: aid, ...b, updated_at: now() };
      richMenus.set(aid, menu);
      return json({ rich_menu: menu, status: 'saved' }, 201);
    }
  }
  if ((m = p.match(/^partner\\/accounts\\/([\\w-]+)\\/bot-rules$/))) {
    const aid = m[1];
    if (method === 'GET') {
      return json({ rules: oaBotRules.get(aid) || [] });
    }
    if (method === 'POST') {
      const b = await readJson(request);
      const rawKw = Array.isArray(b.keywords) ? b.keywords : String(b.keyword || '').split(',');
      const keywords = rawKw.map(k => String(k).trim()).filter(Boolean);
      const reply = clip(String(b.reply || b.response || ''), 1000);
      if (!keywords.length || !reply) return bad('키워드와 답변 내용을 입력하세요');
      const rules = oaBotRules.get(aid) || [];
      const newRule = { id: uid(), keywords, reply, match_type: b.match_type || 'contains', updated_at: now() };
      rules.push(newRule);
      oaBotRules.set(aid, rules);
      return json({ rule: newRule, rules }, 201);
    }
  }
  if ((m = p.match(/^partner\\/accounts\\/([\\w-]+)\\/bot-rules\\/([\\w-]+)$/)) && method === 'DELETE') {
    const [_, aid, ruleId] = m;
    let rules = oaBotRules.get(aid) || [];
    rules = rules.filter(r => r.id !== ruleId);
    oaBotRules.set(aid, rules);
    return json({ status: 'deleted', rule_id: ruleId });
  }`;

if (code.includes("p.match(/^partner\\/accounts\\/([\\w-]+)\\/rich-menus$/)") && !code.includes("p.match(/^partner\\/accounts\\/([\\w-]+)\\/bot-rules$/)")) {
  code = code.replace(oldPartnerRichMenu.replace(/\r?\n/g, '\r\n'), newPartnerRichMenu.replace(/\r?\n/g, '\r\n'));
}

// 6. CallKit push integration on calls POST
const oldCallsPost = `    const call = { id: uid(), conversation_id: conv.id, kind: b.kind || 'video', state: 'ringing', initiated_by: myId, started_at: now(), connected_at: null, ended_at: null };
    callSessions.set(call.id, call);
    broadcast({ type: 'call.ringing', call_id: call.id, conversation_id: conv.id, initiated_by: myId, kind: call.kind });
    return json({ id: call.id, state: 'ringing', kind: call.kind }, 201);`;

const newCallsPost = `    const call = { id: uid(), conversation_id: conv.id, kind: b.kind || 'video', state: 'ringing', initiated_by: myId, started_at: now(), connected_at: null, ended_at: null };
    callSessions.set(call.id, call);
    const peerId = conv.members.find(x => x !== myId);
    const callkitPayload = {
      type: 'call.ringing',
      call_id: call.id,
      conversation_id: conv.id,
      initiated_by: myId,
      caller_name: me.display_name,
      caller_handle: me.handle,
      caller_avatar_color: me.avatar_color,
      kind: call.kind,
      has_video: call.kind === 'video',
      callkit: {
        uuid: call.id,
        handle: me.handle || me.display_name,
        hasVideo: call.kind === 'video',
        localizedCallerName: me.display_name
      }
    };
    broadcast(callkitPayload);
    return json({ id: call.id, state: 'ringing', kind: call.kind, callkit: callkitPayload.callkit }, 201);`;

if (code.includes("broadcast({ type: 'call.ringing', call_id: call.id, conversation_id: conv.id, initiated_by: myId, kind: call.kind });")) {
  code = code.replace(oldCallsPost.replace(/\r?\n/g, '\r\n'), newCallsPost.replace(/\r?\n/g, '\r\n'));
}

fs.writeFileSync(file, code, 'utf8');
console.log('Successfully applied Track 4, Track 3, Track 2 updates to scripts/cf_worker.js');

