<script setup lang="ts">
import LunoThemeToggle from '../../shared/LunoThemeToggle.vue'
import { ref } from 'vue'
import { request, type LoginResult } from '../../shared/api'

type Org = { id: string; name: string; state: string; my_role: string }
type Account = { id: string; name: string; status: string }
type Ticket = { id: string; contact_id: string; status: string; priority: string; internal_note: string }

type RichMenuTile = {
  id: string
  label: string
  icon: string
  action: { type: 'message' | 'uri'; text?: string; uri?: string }
}

type BotRule = {
  id: string
  keywords: string[]
  reply: string
  match_type?: string
}

const token = ref(''), email = ref(''), password = ref(''), error = ref(''), note = ref('')
const orgName = ref(''), country = ref('KR'), selectedOrg = ref('')
const accountName = ref(''), selectedAccount = ref('')
const orgs = ref<Org[]>([]), accounts = ref<Account[]>([])
const tickets = ref<Ticket[]>([])

const activeTab = ref<'tickets' | 'campaigns' | 'richmenu' | 'botrules'>('richmenu')
const accountLoading = ref(false)
const accountReady = ref(false)
let accountLoadVersion = 0
function resetAccountEditor() {
  tickets.value = []; botRules.value = []; simOutput.value = ''
  richMenuTitle.value = ''; richMenuLayout.value = 'grid_2x3'; selectedTileIndex.value = 0
  richMenuTiles.value = Array.from({ length: 6 }, (_, index) => ({ id: `t${index + 1}`, label: '', icon: '', action: { type: 'message', text: '' } }))
  accountReady.value = false
}

// Tickets & Campaigns state
const newTicketContactID = ref(''), newTicketNote = ref(''), newTicketPrio = ref('normal')
const newCampaignName = ref('')
const newCouponCode = ref(''), newCouponRedemptions = ref(50)

// Rich Menu state
const richMenuTitle = ref('공식 채널 종합 리치 메뉴')
const richMenuLayout = ref<'grid_2x3' | 'grid_1x3'>('grid_2x3')
const richMenuTiles = ref<RichMenuTile[]>([
  { id: 't1', label: '📢 최신 공지', icon: '📢', action: { type: 'message', text: '공지사항' } },
  { id: 't2', label: '💬 고객 상담', icon: '💬', action: { type: 'message', text: '상담' } },
  { id: 't3', label: '🔒 보안 센터', icon: '🔒', action: { type: 'message', text: '보안 안내' } },
  { id: 't4', label: '🎁 진행 이벤트', icon: '🎁', action: { type: 'message', text: '이벤트' } },
  { id: 't5', label: '❓ 자주 묻는 질문', icon: '❓', action: { type: 'message', text: '도움말' } },
  { id: 't6', label: '🌐 공식 웹사이트', icon: '🌐', action: { type: 'uri', uri: 'https://line-messenger.dnjstjqppk.workers.dev' } },
])
const selectedTileIndex = ref(0)

// Chatbot CRM state
const botRules = ref<BotRule[]>([])
const newBotKeywords = ref('')
const newBotReply = ref('')
const simInput = ref('')
const simOutput = ref('')

async function run(fn: () => Promise<void>) {
  error.value = ''; note.value = ''
  try { await fn() } catch (e) { error.value = (e as Error).message }
}

async function login() {
  await run(async () => {
    const x = await request<LoginResult>('/api/v1/auth/login', null, 'POST', { email: email.value, password: password.value })
    token.value = x.access_token
    password.value = ''
    await loadOrgs()
  })
}

async function loadOrgs() {
  const x = await request<{ organizations: Org[] }>('/api/v1/partner/organizations', token.value)
  orgs.value = x.organizations || []
}

async function createOrg() {
  await run(async () => {
    await request('/api/v1/partner/organizations', token.value, 'POST', { name: orgName.value, legal_name: orgName.value, country: country.value })
    orgName.value = ''
    await loadOrgs()
    note.value = '기업 조직이 생성되었습니다.'
  })
}

async function selectOrg(id: string) {
  await run(async () => {
    selectedOrg.value = id
    selectedAccount.value = ''
    accountLoadVersion++; accounts.value = []; resetAccountEditor()
    const x = await request<{ accounts: Account[] }>(`/api/v1/partner/organizations/${id}/accounts`, token.value)
    if (selectedOrg.value !== id) return
    accounts.value = x.accounts || []
    if (accounts.value.length > 0) {
      await selectAccount(accounts.value[0].id)
    }
  })
}

async function createAccount() {
  await run(async () => {
    await request(`/api/v1/partner/organizations/${selectedOrg.value}/accounts`, token.value, 'POST', { name: accountName.value, description: '' })
    accountName.value = ''
    await selectOrg(selectedOrg.value)
    note.value = '공식계정이 생성되었습니다.'
  })
}

async function selectAccount(id: string) {
  selectedAccount.value = id
  resetAccountEditor()
  const version = ++accountLoadVersion
  accountLoading.value = true; error.value = ''
  try {
    await Promise.all([loadTickets(), loadRichMenu(), loadBotRules()])
    if (version === accountLoadVersion) accountReady.value = true
  } catch (failure) {
    if (version === accountLoadVersion) error.value = (failure as Error).message
  } finally { if (version === accountLoadVersion) accountLoading.value = false }
}

async function loadTickets() {
  if (!selectedAccount.value) return
  const id = selectedAccount.value, version = accountLoadVersion
  const x = await request<{ tickets: Ticket[] }>(`/api/v1/partner/accounts/${id}/tickets`, token.value)
  if (version === accountLoadVersion && id === selectedAccount.value) tickets.value = x.tickets || []
}

async function loadRichMenu() {
  if (!selectedAccount.value) return
  const id = selectedAccount.value, version = accountLoadVersion
  const x = await request<{ rich_menu?: any }>(`/api/v1/partner/accounts/${id}/rich-menus`, token.value)
  if (version !== accountLoadVersion || id !== selectedAccount.value) return
  if (x && x.rich_menu) {
    richMenuTitle.value = x.rich_menu.title || richMenuTitle.value
    richMenuLayout.value = x.rich_menu.layout || richMenuLayout.value
    if (Array.isArray(x.rich_menu.tiles) && x.rich_menu.tiles.length > 0) {
      richMenuTiles.value = x.rich_menu.tiles
    }
  }
}

async function saveRichMenu() {
  await run(async () => {
    if (!accountReady.value || accountLoading.value) throw new Error('선택한 계정의 설정을 먼저 불러오세요.')
    const tilesToSave = richMenuLayout.value === 'grid_1x3' ? richMenuTiles.value.slice(0, 3) : richMenuTiles.value
    await request(`/api/v1/partner/accounts/${selectedAccount.value}/rich-menus`, token.value, 'POST', {
      title: richMenuTitle.value.trim(),
      layout: richMenuLayout.value,
      tiles: tilesToSave,
      enabled: true,
    })
    note.value = 'Rich Menu 설정을 저장했습니다.'
  })
}

function switchLayout(layout: 'grid_2x3' | 'grid_1x3') {
  richMenuLayout.value = layout
  if (layout === 'grid_1x3' && richMenuTiles.value.length > 3) {
    // keep as is, render first 3
  } else if (layout === 'grid_2x3' && richMenuTiles.value.length < 6) {
    while (richMenuTiles.value.length < 6) {
      const idx = richMenuTiles.value.length + 1
      richMenuTiles.value.push({
        id: `t${idx}`,
        label: `버튼 ${idx}`,
        icon: '📌',
        action: { type: 'message', text: `버튼 ${idx}` }
      })
    }
  }
}

async function loadBotRules() {
  if (!selectedAccount.value) return
  const id = selectedAccount.value, version = accountLoadVersion
  const x = await request<{ rules?: BotRule[] }>(`/api/v1/partner/accounts/${id}/bot-rules`, token.value)
  if (version === accountLoadVersion && id === selectedAccount.value) botRules.value = x.rules || []
}

async function createBotRule() {
  await run(async () => {
    const kw = newBotKeywords.value.split(',').map(s => s.trim()).filter(Boolean)
    if (!kw.length || !newBotReply.value.trim()) throw new Error('키워드와 답변 내용을 모두 입력하세요.')
    await request(`/api/v1/partner/accounts/${selectedAccount.value}/bot-rules`, token.value, 'POST', {
      keywords: kw,
      reply: newBotReply.value.trim(),
      match_type: 'contains'
    })
    newBotKeywords.value = ''
    newBotReply.value = ''
    await loadBotRules()
    note.value = '챗봇 자동응답 룰이 추가되었습니다.'
  })
}

async function deleteBotRule(id: string) {
  await run(async () => {
    await request(`/api/v1/partner/accounts/${selectedAccount.value}/bot-rules/${id}`, token.value, 'DELETE')
    await loadBotRules()
    note.value = '자동응답 룰이 삭제되었습니다.'
  })
}

function runSimulator() {
  if (!simInput.value.trim()) return
  const t = simInput.value.trim().toLowerCase()
  for (const r of botRules.value) {
    if (r.keywords && r.keywords.some(k => t.includes(k.toLowerCase()))) {
      simOutput.value = r.reply
      return
    }
  }
  simOutput.value = `[기본 응답] 메시지를 전달받았습니다. 하단 리치 메뉴를 누르시거나 '도움말'을 입력해 보세요.`
}

async function createTicket() {
  await run(async () => {
    await request(`/api/v1/partner/accounts/${selectedAccount.value}/tickets`, token.value, 'POST', {
      contact_id: newTicketContactID.value.trim(),
      priority: newTicketPrio.value,
      internal_note: newTicketNote.value,
    })
    newTicketContactID.value = ''; newTicketNote.value = ''
    await loadTickets()
    note.value = '고객 상담 티켓이 접수되었습니다.'
  })
}

async function createCampaign() {
  await run(async () => {
    await request(`/api/v1/partner/accounts/${selectedAccount.value}/campaigns`, token.value, 'POST', {
      name: newCampaignName.value.trim(),
      message_template: { text: '공식계정 프로모션 알림' },
    })
    newCampaignName.value = ''
    note.value = '브로드캐스트 메시지 캠페인이 등록되었습니다.'
  })
}

async function createCoupon() {
  await run(async () => {
    await request(`/api/v1/partner/accounts/${selectedAccount.value}/coupons`, token.value, 'POST', {
      code: newCouponCode.value.trim(),
      max_redemptions: newCouponRedemptions.value,
    })
    newCouponCode.value = ''
    note.value = '할인 쿠폰이 발급되었습니다.'
  })
}
</script>

<template>
  <div class="wrap page">
    <nav style="display:flex;gap:12px;margin-bottom:18px;padding:10px 14px;background:#fff;border-radius:10px;font-size:13px;align-items:center;border:1px solid #e0e8ee">
      <a href="../" style="text-decoration:none;color:#315BCD;font-weight:700">💬 LUNO 메신저 홈</a>
      <span style="color:#ccc">|</span>
      <a href="../admin/" style="text-decoration:none;color:#334155;font-weight:600">👑 관리자</a>
      <a href="../partner/" style="text-decoration:none;color:#315BCD;font-weight:700">🏢 파트너</a>
      <a href="../developer/" style="text-decoration:none;color:#334155;font-weight:600">💻 개발자</a>
      <a href="../creator/" style="text-decoration:none;color:#334155;font-weight:600">🎨 크리에이터</a>
      <a href="../ads/" style="text-decoration:none;color:#334155;font-weight:600">📢 광고주</a>
      <button v-if="token" @click="token = ''" style="margin-left:auto;padding:4px 8px;font-size:12px">로그아웃</button>
    </nav>

    <header><LunoThemeToggle />
      <h1>LUNO 비즈니스 파트너 센터 (Partner)</h1>
      <p>공식 채널 · Rich Menu 디자이너 · 챗봇 CRM · 브로드캐스트 캠페인 · 상담 티켓</p>
    </header>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="note" class="note">{{ note }}</p>

    <form class="panel" v-if="!token" @submit.prevent="login">
      <h2>파트너 로그인</h2>
      <div style="margin:8px 0;padding:8px 12px;background:#f8fafc;border-radius:8px;font-size:12px;color:#64748b">
        <span>🔒 파트너 기업 계정으로 로그인해 주세요.</span>
      </div>
      <input v-model="email" type="email" placeholder="이메일" required />
      <input v-model="password" type="password" placeholder="비밀번호" required />
      <button>로그인</button>
    </form>

    <main v-else class="grid">
      <!-- Left sidebar: Orgs and Accounts -->
      <section class="panel">
        <h2>내 기업 조직</h2>
        <form @submit.prevent="createOrg">
          <input v-model="orgName" placeholder="기업명" minlength="2" required />
          <input v-model="country" maxlength="8" placeholder="국가 코드" />
          <button>조직 생성</button>
        </form>
        <div v-for="o in orgs" :key="o.id">
          <button class="item" :class="{ selected: selectedOrg === o.id }" @click="selectOrg(o.id)">
            <strong>{{ o.name }}</strong>
            <small>({{ o.state }} · {{ o.my_role }})</small>
          </button>
        </div>

        <template v-if="selectedOrg">
          <h2 style="margin-top:24px">공식계정 목록</h2>
          <form @submit.prevent="createAccount">
            <input v-model="accountName" placeholder="공식계정 이름" minlength="2" required />
            <button>공식계정 생성</button>
          </form>
          <div v-for="a in accounts" :key="a.id">
            <button class="item" :class="{ selected: selectedAccount === a.id }" @click="selectAccount(a.id)">
              <strong>{{ a.name }}</strong>
              <small>상태: {{ a.status }}</small>
            </button>
          </div>
        </template>
      </section>

      <!-- Right Main Workspace: Tabs -->
      <section class="panel" v-if="selectedAccount">
        <div class="tabs-bar">
          <button :class="{ active: activeTab === 'richmenu' }" @click="activeTab = 'richmenu'">📱 Rich Menu 디자이너</button>
          <button :class="{ active: activeTab === 'botrules' }" @click="activeTab = 'botrules'">🤖 챗봇 CRM 자동응답</button>
          <button :class="{ active: activeTab === 'tickets' }" @click="activeTab = 'tickets'">📩 고객 상담 티켓</button>
          <button :class="{ active: activeTab === 'campaigns' }" @click="activeTab = 'campaigns'">📢 브로드캐스트</button>
        </div>

        <!-- 1. Rich Menu Designer -->
        <div v-if="activeTab === 'richmenu'" class="tool-content">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h3>인터랙티브 Rich Menu 디자이너</h3>
            <button @click="saveRichMenu" :disabled="accountLoading || !accountReady" style="background:#06c755;font-weight:700">💾 Rich Menu 저장 및 활성화</button>
          </div>
          <p class="muted">사용자가 공식 계정 대화방을 열었을 때 하단에 고정 표시되는 인터랙티브 타일 메뉴입니다.</p>

          <div style="display:flex;gap:16px;margin:12px 0">
            <div style="flex:1">
              <label style="font-size:12px;font-weight:600;display:block">메뉴 타이틀</label>
              <input v-model="richMenuTitle" placeholder="메뉴 이름" style="width:100%;box-sizing:border-box" />
            </div>
            <div style="width:200px">
              <label style="font-size:12px;font-weight:600;display:block">레이아웃 템플릿</label>
              <div style="display:flex;gap:6px;margin-top:4px">
                <button type="button" :class="{ 'btn-selected': richMenuLayout === 'grid_2x3' }" @click="switchLayout('grid_2x3')" style="flex:1;font-size:12px">2×3 (6칸)</button>
                <button type="button" :class="{ 'btn-selected': richMenuLayout === 'grid_1x3' }" @click="switchLayout('grid_1x3')" style="flex:1;font-size:12px">1×3 (3칸)</button>
              </div>
            </div>
          </div>

          <!-- Interactive Grid Visualizer -->
          <h4>실시간 미리보기 및 타일 선택</h4>
          <div class="rich-menu-preview" :class="richMenuLayout">
            <div
              v-for="(tile, i) in (richMenuLayout === 'grid_1x3' ? richMenuTiles.slice(0, 3) : richMenuTiles.slice(0, 6))"
              :key="tile.id"
              class="preview-tile"
              :class="{ 'tile-active': selectedTileIndex === i }"
              @click="selectedTileIndex = i"
            >
              <span class="tile-icon">{{ tile.icon }}</span>
              <span class="tile-label">{{ tile.label }}</span>
              <span class="tile-type-badge">{{ tile.action.type === 'uri' ? '링크' : '메시지' }}</span>
            </div>
          </div>

          <!-- Tile Editor -->
          <div class="tile-editor" v-if="richMenuTiles[selectedTileIndex]">
            <h4>타일 #{{ selectedTileIndex + 1 }} 설정</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div>
                <label>표시 라벨</label>
                <input v-model="richMenuTiles[selectedTileIndex].label" placeholder="버튼 텍스트" />
              </div>
              <div>
                <label>이모지 / 아이콘</label>
                <input v-model="richMenuTiles[selectedTileIndex].icon" placeholder="📢, 💬, 🎁 등" />
              </div>
            </div>
            <div style="margin-top:10px">
              <label>동작 종류</label>
              <select v-model="richMenuTiles[selectedTileIndex].action.type">
                <option value="message">메시지 전송 (챗봇 연동)</option>
                <option value="uri">웹링크 열기 (URI)</option>
              </select>
            </div>
            <div style="margin-top:10px" v-if="richMenuTiles[selectedTileIndex].action.type === 'message'">
              <label>전송할 메시지 내용 (챗봇이 이 키워드를 인식하여 자동응답합니다)</label>
              <input v-model="richMenuTiles[selectedTileIndex].action.text" placeholder="예: 공지사항, 상담, 이벤트" />
            </div>
            <div style="margin-top:10px" v-else>
              <label>연결 웹사이트 주소 (HTTPS)</label>
              <input v-model="richMenuTiles[selectedTileIndex].action.uri" placeholder="https://example.com" />
            </div>
          </div>
        </div>

        <!-- 2. Chatbot CRM Rules -->
        <div v-else-if="activeTab === 'botrules'" class="tool-content">
          <h3>챗봇 CRM 키워드 자동응답 룰 빌더</h3>
          <p class="muted">고객이 특정 단어를 입력하거나 리치 메뉴 버튼을 눌렀을 때 챗봇이 즉시 자동 회신할 규칙을 구성합니다.</p>

          <!-- Add Rule Form -->
          <div style="background:#f8fafc;padding:16px;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:18px">
            <h4>새 자동응답 규칙 등록</h4>
            <div style="margin:8px 0">
              <label style="font-size:12px;font-weight:600">감지 키워드 (콤마로 구분하여 복수 등록 가능)</label>
              <input v-model="newBotKeywords" placeholder="예: 배송, 택배, 송장" style="width:100%;box-sizing:border-box" />
            </div>
            <div style="margin:8px 0">
              <label style="font-size:12px;font-weight:600">챗봇 자동 답변 메시지</label>
              <textarea v-model="newBotReply" rows="3" placeholder="고객에게 자동으로 전송할 답변 내용을 입력하세요." style="width:100%;box-sizing:border-box;padding:8px;border-radius:8px;border:1px solid #cad5e2"></textarea>
            </div>
            <button @click="createBotRule" style="background:#315BCD;font-weight:600">규칙 추가</button>
          </div>

          <!-- Rules List -->
          <h4>등록된 챗봇 규칙 목록 ({{ botRules.length }}개)</h4>
          <div v-if="botRules.length === 0" class="muted">등록된 규칙이 없습니다. 위에서 새 규칙을 추가하세요.</div>
          <div v-for="r in botRules" :key="r.id" class="rule-card">
            <div style="flex:1">
              <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
                <span class="badge" v-for="kw in r.keywords" :key="kw">#{{ kw }}</span>
              </div>
              <div style="font-size:13px;white-space:pre-wrap;color:#334155">{{ r.reply }}</div>
            </div>
            <button @click="deleteBotRule(r.id)" style="background:#ef4444;padding:4px 8px;font-size:12px;align-self:flex-start">삭제</button>
          </div>

          <!-- Interactive Simulator -->
          <div style="margin-top:24px;background:#f0fdf4;padding:16px;border-radius:10px;border:1px solid #bbf7d0">
            <h4>💬 챗봇 응답 실시간 시뮬레이터</h4>
            <p style="font-size:12px;color:#166534">고객 관점에서 메시지를 입력하고 규칙이 정상 작동하는지 테스트해 보세요.</p>
            <div style="display:flex;gap:8px">
              <input v-model="simInput" placeholder="테스트 질문 입력 (예: 공지사항, 배송)" @keyup.enter="runSimulator" style="flex:1" />
              <button @click="runSimulator" style="background:#16a34a">테스트 전송</button>
            </div>
            <div v-if="simOutput" style="margin-top:10px;padding:12px;background:#fff;border-radius:8px;border:1px solid #86efac;font-size:13px;white-space:pre-wrap">
              <strong>🤖 챗봇 답변:</strong><br>{{ simOutput }}
            </div>
          </div>
        </div>

        <!-- 3. Customer Tickets (Shared Inbox) -->
        <div v-else-if="activeTab === 'tickets'" class="tool-content">
          <h3>고객 상담 티켓 (Shared Inbox)</h3>
          <form @submit.prevent="createTicket" class="mini-form">
            <input v-model="newTicketContactID" placeholder="고객 Contact UUID" required />
            <input v-model="newTicketNote" placeholder="상담 문의 내용" required />
            <select v-model="newTicketPrio">
              <option value="normal">보통</option>
              <option value="urgent">긴급</option>
            </select>
            <button>티켓 접수</button>
          </form>
          <div v-for="t in tickets" :key="t.id" class="ticket-card">
            <span>[{{ t.priority }}] {{ t.internal_note }}</span>
            <small>{{ t.status }}</small>
          </div>
        </div>

        <!-- 4. Broadcast & Coupons -->
        <div v-else-if="activeTab === 'campaigns'" class="tool-content">
          <h3>브로드캐스트 메시지 캠페인</h3>
          <form @submit.prevent="createCampaign" class="mini-form">
            <input v-model="newCampaignName" placeholder="캠페인 명칭" required />
            <button>캠페인 예약 발송</button>
          </form>

          <h3 style="margin-top:24px">프로모션 쿠폰 발급</h3>
          <form @submit.prevent="createCoupon" class="mini-form">
            <input v-model="newCouponCode" placeholder="쿠폰 코드 (예: LINE2026)" required />
            <input type="number" v-model="newCouponRedemptions" min="1" placeholder="수량" />
            <button>쿠폰 생성</button>
          </form>
        </div>
      </section>

      <p v-else class="muted panel">왼쪽에서 기업 조직 및 공식계정을 선택하세요.</p>
    </main>
  </div>
</template>

<style>
body{background:#f3f6fa;margin:0;font:15px system-ui;color:#1d2d45}
.wrap{max-width:1200px;margin:auto;padding:25px}
.panel{background:white;border-radius:12px;padding:22px;border:1px solid #dce4ed;margin:14px 0}
.grid{display:grid;grid-template-columns:320px minmax(0,1fr);gap:20px}
input,button,select,textarea{padding:10px;border:1px solid #cad5e2;border-radius:9px;margin:4px}
button{background:#078452;color:white;cursor:pointer}
.item{display:block;margin:8px 0;padding:10px;width:100%;text-align:left;background:#edf3f9;color:#203047;border:1px solid transparent;border-radius:8px}
.item.selected{border-color:#078452;background:#dcf2e8}
small{color:#6a798b}
.mini-form{display:flex;gap:6px;margin:8px 0}
.ticket-card{display:flex;justify-content:space-between;background:#f8fafc;padding:8px 12px;border-radius:6px;margin:6px 0;font-size:13px}
.error{color:#b52222;background:#fee;padding:10px;border-radius:8px}
.note{color:#087743;background:#eef8f3;padding:10px;border-radius:8px}
.muted{color:#6c757d}

.tabs-bar{display:flex;gap:8px;border-bottom:2px solid #e2e8f0;padding-bottom:8px;margin-bottom:16px}
.tabs-bar button{background:transparent;color:#475569;border:none;font-weight:600;padding:8px 12px;border-radius:6px}
.tabs-bar button.active{background:#e2e8f0;color:#0f172a}

.rich-menu-preview{display:grid;gap:8px;background:#1e293b;padding:12px;border-radius:12px;margin:12px 0;box-sizing:border-box}
.rich-menu-preview.grid_2x3{grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,80px)}
.rich-menu-preview.grid_1x3{grid-template-columns:repeat(3,1fr);grid-template-rows:80px}
.preview-tile{background:#334155;color:#fff;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;position:relative;border:2px solid transparent;transition:all .15s}
.preview-tile:hover{background:#475569}
.preview-tile.tile-active{border-color:#06c755;background:#1e3a5f}
.tile-icon{font-size:20px;margin-bottom:2px}
.tile-label{font-size:12px;font-weight:600}
.tile-type-badge{position:absolute;top:4px;right:4px;font-size:9px;background:rgba(0,0,0,0.4);padding:2px 4px;border-radius:4px;color:#94a3b8}

.tile-editor{background:#f8fafc;padding:14px;border-radius:8px;border:1px solid #e2e8f0;margin-top:14px}
.btn-selected{background:#315BCD!important;color:#fff!important}
.rule-card{display:flex;justify-content:space-between;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin:8px 0}
.badge{background:#e0e7ff;color:#3730a3;font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px}

@media(max-width:760px){.grid{grid-template-columns:1fr}}
</style>
