<script setup lang="ts">
import LunoThemeToggle from '../../shared/LunoThemeToggle.vue'
import { ref } from 'vue'
import { request, type LoginResult } from '../../shared/api'
import { consoleT, detectConsoleLocale, setConsoleLocale, type ConsoleLocale } from '../../shared/console-i18n'

const locale = ref<ConsoleLocale>(detectConsoleLocale())
const t = (key: string, params?: Record<string, string | number>) => consoleT(locale.value, key, params)
function toggleLocale() {
  locale.value = locale.value === 'ko' ? 'en' : 'ko'
  setConsoleLocale(locale.value)
}

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

// Rich Menu state (seed tiles localize once at init; the merchant then edits them as content)
const richMenuTitle = ref(t('partner.seedTitle'))
const richMenuLayout = ref<'grid_2x3' | 'grid_1x3'>('grid_2x3')
const richMenuTiles = ref<RichMenuTile[]>([
  { id: 't1', label: t('partner.seed1L'), icon: '📢', action: { type: 'message', text: t('partner.seed1T') } },
  { id: 't2', label: t('partner.seed2L'), icon: '💬', action: { type: 'message', text: t('partner.seed2T') } },
  { id: 't3', label: t('partner.seed3L'), icon: '🔒', action: { type: 'message', text: t('partner.seed3T') } },
  { id: 't4', label: t('partner.seed4L'), icon: '🎁', action: { type: 'message', text: t('partner.seed4T') } },
  { id: 't5', label: t('partner.seed5L'), icon: '❓', action: { type: 'message', text: t('partner.seed5T') } },
  { id: 't6', label: t('partner.seed6L'), icon: '🌐', action: { type: 'uri', uri: 'https://luno-messenger.dnjstjqppk.workers.dev' } },
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
    note.value = t('partner.orgCreated')
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
    note.value = t('partner.accountCreated')
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
    if (!accountReady.value || accountLoading.value) throw new Error(t('partner.loadFirst'))
    const tilesToSave = richMenuLayout.value === 'grid_1x3' ? richMenuTiles.value.slice(0, 3) : richMenuTiles.value
    await request(`/api/v1/partner/accounts/${selectedAccount.value}/rich-menus`, token.value, 'POST', {
      title: richMenuTitle.value.trim(),
      layout: richMenuLayout.value,
      tiles: tilesToSave,
      enabled: true,
    })
    note.value = t('partner.rmSaved')
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
        label: t('partner.btnN', { n: idx }),
        icon: '📌',
        action: { type: 'message', text: t('partner.btnN', { n: idx }) }
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
    if (!kw.length || !newBotReply.value.trim()) throw new Error(t('partner.ruleNeedBoth'))
    await request(`/api/v1/partner/accounts/${selectedAccount.value}/bot-rules`, token.value, 'POST', {
      keywords: kw,
      reply: newBotReply.value.trim(),
      match_type: 'contains'
    })
    newBotKeywords.value = ''
    newBotReply.value = ''
    await loadBotRules()
    note.value = t('partner.ruleAdded')
  })
}

async function deleteBotRule(id: string) {
  await run(async () => {
    await request(`/api/v1/partner/accounts/${selectedAccount.value}/bot-rules/${id}`, token.value, 'DELETE')
    await loadBotRules()
    note.value = t('partner.ruleDeleted')
  })
}

function runSimulator() {
  if (!simInput.value.trim()) return
  const q = simInput.value.trim().toLowerCase()
  for (const r of botRules.value) {
    if (r.keywords && r.keywords.some(k => q.includes(k.toLowerCase()))) {
      simOutput.value = r.reply
      return
    }
  }
  simOutput.value = t('partner.simDefault')
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
    note.value = t('partner.ticketCreated')
  })
}

async function createCampaign() {
  await run(async () => {
    await request(`/api/v1/partner/accounts/${selectedAccount.value}/campaigns`, token.value, 'POST', {
      name: newCampaignName.value.trim(),
      message_template: { text: t('partner.campTemplate') },
    })
    newCampaignName.value = ''
    note.value = t('partner.campCreated')
  })
}

async function createCoupon() {
  await run(async () => {
    await request(`/api/v1/partner/accounts/${selectedAccount.value}/coupons`, token.value, 'POST', {
      code: newCouponCode.value.trim(),
      max_redemptions: newCouponRedemptions.value,
    })
    newCouponCode.value = ''
    note.value = t('partner.couponCreated')
  })
}
</script>

<template>
  <div class="wrap page">
    <nav style="display:flex;gap:12px;margin-bottom:18px;padding:10px 14px;background:#fff;border-radius:10px;font-size:13px;align-items:center;border:1px solid #e0e8ee">
      <a href="../" style="text-decoration:none;color:#315BCD;font-weight:700">{{ t('nav.home') }}</a>
      <span style="color:#ccc">|</span>
      <a href="../admin/" style="text-decoration:none;color:#334155;font-weight:600">{{ t('nav.admin') }}</a>
      <a href="../partner/" style="text-decoration:none;color:#315BCD;font-weight:700">{{ t('nav.partner') }}</a>
      <a href="../developer/" style="text-decoration:none;color:#334155;font-weight:600">{{ t('nav.developer') }}</a>
      <a href="../creator/" style="text-decoration:none;color:#334155;font-weight:600">{{ t('nav.creator') }}</a>
      <a href="../ads/" style="text-decoration:none;color:#334155;font-weight:600">{{ t('nav.ads') }}</a>
      <button @click="toggleLocale" style="margin-left:auto;padding:4px 8px;font-size:12px">{{ t('nav.lang') }}</button>
      <button v-if="token" @click="token = ''" style="padding:4px 8px;font-size:12px">{{ t('nav.logout') }}</button>
    </nav>

    <header><LunoThemeToggle />
      <h1>{{ t('partner.title') }}</h1>
      <p>{{ t('partner.sub') }}</p>
    </header>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="note" class="note">{{ note }}</p>

    <form class="panel" v-if="!token" @submit.prevent="login">
      <h2>{{ t('partner.loginTitle') }}</h2>
      <div style="margin:8px 0;padding:8px 12px;background:#f8fafc;border-radius:8px;font-size:12px;color:#64748b">
        <span>{{ t('partner.loginHint') }}</span>
      </div>
      <input v-model="email" type="email" :placeholder="t('form.emailPh')" required />
      <input v-model="password" type="password" :placeholder="t('form.passwordPh')" required />
      <button>{{ t('form.login') }}</button>
    </form>

    <main v-else class="grid">
      <!-- Left sidebar: Orgs and Accounts -->
      <section class="panel">
        <h2>{{ t('partner.orgs') }}</h2>
        <form @submit.prevent="createOrg">
          <input v-model="orgName" :placeholder="t('partner.orgNamePh')" minlength="2" required />
          <input v-model="country" maxlength="8" :placeholder="t('partner.countryPh')" />
          <button>{{ t('partner.createOrg') }}</button>
        </form>
        <div v-for="o in orgs" :key="o.id">
          <button class="item" :class="{ selected: selectedOrg === o.id }" @click="selectOrg(o.id)">
            <strong>{{ o.name }}</strong>
            <small>({{ o.state }} · {{ o.my_role }})</small>
          </button>
        </div>

        <template v-if="selectedOrg">
          <h2 style="margin-top:24px">{{ t('partner.accounts') }}</h2>
          <form @submit.prevent="createAccount">
            <input v-model="accountName" :placeholder="t('partner.accountNamePh')" minlength="2" required />
            <button>{{ t('partner.createAccount') }}</button>
          </form>
          <div v-for="a in accounts" :key="a.id">
            <button class="item" :class="{ selected: selectedAccount === a.id }" @click="selectAccount(a.id)">
              <strong>{{ a.name }}</strong>
              <small>{{ t('partner.accountState') }} {{ a.status }}</small>
            </button>
          </div>
        </template>
      </section>

      <!-- Right Main Workspace: Tabs -->
      <section class="panel" v-if="selectedAccount">
        <div class="tabs-bar">
          <button :class="{ active: activeTab === 'richmenu' }" @click="activeTab = 'richmenu'">{{ t('partner.tabRichmenu') }}</button>
          <button :class="{ active: activeTab === 'botrules' }" @click="activeTab = 'botrules'">{{ t('partner.tabBot') }}</button>
          <button :class="{ active: activeTab === 'tickets' }" @click="activeTab = 'tickets'">{{ t('partner.tabTickets') }}</button>
          <button :class="{ active: activeTab === 'campaigns' }" @click="activeTab = 'campaigns'">{{ t('partner.tabCampaigns') }}</button>
        </div>

        <!-- 1. Rich Menu Designer -->
        <div v-if="activeTab === 'richmenu'" class="tool-content">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h3>{{ t('partner.rmTitle') }}</h3>
            <button @click="saveRichMenu" :disabled="accountLoading || !accountReady" style="background:#4F7CFF;font-weight:700">{{ t('partner.rmSave') }}</button>
          </div>
          <p class="muted">{{ t('partner.rmDesc') }}</p>

          <div style="display:flex;gap:16px;margin:12px 0">
            <div style="flex:1">
              <label style="font-size:12px;font-weight:600;display:block">{{ t('partner.menuTitle') }}</label>
              <input v-model="richMenuTitle" :placeholder="t('partner.menuNamePh')" style="width:100%;box-sizing:border-box" />
            </div>
            <div style="width:200px">
              <label style="font-size:12px;font-weight:600;display:block">{{ t('partner.layoutTpl') }}</label>
              <div style="display:flex;gap:6px;margin-top:4px">
                <button type="button" :class="{ 'btn-selected': richMenuLayout === 'grid_2x3' }" @click="switchLayout('grid_2x3')" style="flex:1;font-size:12px">{{ t('partner.layout6') }}</button>
                <button type="button" :class="{ 'btn-selected': richMenuLayout === 'grid_1x3' }" @click="switchLayout('grid_1x3')" style="flex:1;font-size:12px">{{ t('partner.layout3') }}</button>
              </div>
            </div>
          </div>

          <!-- Interactive Grid Visualizer -->
          <h4>{{ t('partner.preview') }}</h4>
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
              <span class="tile-type-badge">{{ tile.action.type === 'uri' ? t('partner.linkBadge') : t('partner.msgBadge') }}</span>
            </div>
          </div>

          <!-- Tile Editor -->
          <div class="tile-editor" v-if="richMenuTiles[selectedTileIndex]">
            <h4>{{ t('partner.tileN', { n: selectedTileIndex + 1 }) }}</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div>
                <label>{{ t('partner.tileLabel') }}</label>
                <input v-model="richMenuTiles[selectedTileIndex].label" :placeholder="t('partner.tileLabelPh')" />
              </div>
              <div>
                <label>{{ t('partner.tileIcon') }}</label>
                <input v-model="richMenuTiles[selectedTileIndex].icon" :placeholder="t('partner.tileIconPh')" />
              </div>
            </div>
            <div style="margin-top:10px">
              <label>{{ t('partner.actionKind') }}</label>
              <select v-model="richMenuTiles[selectedTileIndex].action.type">
                <option value="message">{{ t('partner.actMessage') }}</option>
                <option value="uri">{{ t('partner.actUri') }}</option>
              </select>
            </div>
            <div style="margin-top:10px" v-if="richMenuTiles[selectedTileIndex].action.type === 'message'">
              <label>{{ t('partner.msgContent') }}</label>
              <input v-model="richMenuTiles[selectedTileIndex].action.text" :placeholder="t('partner.msgContentPh')" />
            </div>
            <div style="margin-top:10px" v-else>
              <label>{{ t('partner.uriLabel') }}</label>
              <input v-model="richMenuTiles[selectedTileIndex].action.uri" placeholder="https://example.com" />
            </div>
          </div>
        </div>

        <!-- 2. Chatbot CRM Rules -->
        <div v-else-if="activeTab === 'botrules'" class="tool-content">
          <h3>{{ t('partner.botTitle') }}</h3>
          <p class="muted">{{ t('partner.botDesc') }}</p>

          <!-- Add Rule Form -->
          <div style="background:#f8fafc;padding:16px;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:18px">
            <h4>{{ t('partner.newRule') }}</h4>
            <div style="margin:8px 0">
              <label style="font-size:12px;font-weight:600">{{ t('partner.kwLabel') }}</label>
              <input v-model="newBotKeywords" :placeholder="t('partner.kwPh')" style="width:100%;box-sizing:border-box" />
            </div>
            <div style="margin:8px 0">
              <label style="font-size:12px;font-weight:600">{{ t('partner.replyLabel') }}</label>
              <textarea v-model="newBotReply" rows="3" :placeholder="t('partner.replyPh')" style="width:100%;box-sizing:border-box;padding:8px;border-radius:8px;border:1px solid #cad5e2"></textarea>
            </div>
            <button @click="createBotRule" style="background:#315BCD;font-weight:600">{{ t('partner.addRule') }}</button>
          </div>

          <!-- Rules List -->
          <h4>{{ t('partner.ruleList', { n: botRules.length }) }}</h4>
          <div v-if="botRules.length === 0" class="muted">{{ t('partner.ruleEmpty') }}</div>
          <div v-for="r in botRules" :key="r.id" class="rule-card">
            <div style="flex:1">
              <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
                <span class="badge" v-for="kw in r.keywords" :key="kw">#{{ kw }}</span>
              </div>
              <div style="font-size:13px;white-space:pre-wrap;color:#334155">{{ r.reply }}</div>
            </div>
            <button @click="deleteBotRule(r.id)" style="background:#ef4444;padding:4px 8px;font-size:12px;align-self:flex-start">{{ t('partner.delete') }}</button>
          </div>

          <!-- Interactive Simulator -->
          <div style="margin-top:24px;background:#f0fdf4;padding:16px;border-radius:10px;border:1px solid #bbf7d0">
            <h4>{{ t('partner.simTitle') }}</h4>
            <p style="font-size:12px;color:#166534">{{ t('partner.simDesc') }}</p>
            <div style="display:flex;gap:8px">
              <input v-model="simInput" :placeholder="t('partner.simPh')" @keyup.enter="runSimulator" style="flex:1" />
              <button @click="runSimulator" style="background:#16a34a">{{ t('partner.simSend') }}</button>
            </div>
            <div v-if="simOutput" style="margin-top:10px;padding:12px;background:#fff;border-radius:8px;border:1px solid #86efac;font-size:13px;white-space:pre-wrap">
              <strong>{{ t('partner.simAnswer') }}</strong><br>{{ simOutput }}
            </div>
          </div>
        </div>

        <!-- 3. Customer Tickets (Shared Inbox) -->
        <div v-else-if="activeTab === 'tickets'" class="tool-content">
          <h3>{{ t('partner.ticketsTitle') }}</h3>
          <form @submit.prevent="createTicket" class="mini-form">
            <input v-model="newTicketContactID" :placeholder="t('partner.contactPh')" required />
            <input v-model="newTicketNote" :placeholder="t('partner.ticketNotePh')" required />
            <select v-model="newTicketPrio">
              <option value="normal">{{ t('partner.prioNormal') }}</option>
              <option value="urgent">{{ t('partner.prioUrgent') }}</option>
            </select>
            <button>{{ t('partner.createTicket') }}</button>
          </form>
          <div v-for="t in tickets" :key="t.id" class="ticket-card">
            <span>[{{ t.priority }}] {{ t.internal_note }}</span>
            <small>{{ t.status }}</small>
          </div>
        </div>

        <!-- 4. Broadcast & Coupons -->
        <div v-else-if="activeTab === 'campaigns'" class="tool-content">
          <h3>{{ t('partner.campTitle') }}</h3>
          <form @submit.prevent="createCampaign" class="mini-form">
            <input v-model="newCampaignName" :placeholder="t('partner.campNamePh')" required />
            <button>{{ t('partner.createCamp') }}</button>
          </form>

          <h3 style="margin-top:24px">{{ t('partner.couponTitle') }}</h3>
          <form @submit.prevent="createCoupon" class="mini-form">
            <input v-model="newCouponCode" :placeholder="t('partner.couponPh')" required />
            <input type="number" v-model="newCouponRedemptions" min="1" :placeholder="t('partner.couponQty')" />
            <button>{{ t('partner.createCoupon') }}</button>
          </form>
        </div>
      </section>

      <p v-else class="muted panel">{{ t('partner.pickOrg') }}</p>
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
.preview-tile.tile-active{border-color:#4F7CFF;background:#1e3a5f}
.tile-icon{font-size:20px;margin-bottom:2px}
.tile-label{font-size:12px;font-weight:600}
.tile-type-badge{position:absolute;top:4px;right:4px;font-size:9px;background:rgba(0,0,0,0.4);padding:2px 4px;border-radius:4px;color:#94a3b8}

.tile-editor{background:#f8fafc;padding:14px;border-radius:8px;border:1px solid #e2e8f0;margin-top:14px}
.btn-selected{background:#315BCD!important;color:#fff!important}
.rule-card{display:flex;justify-content:space-between;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin:8px 0}
.badge{background:#e0e7ff;color:#3730a3;font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px}

@media(max-width:760px){.grid{grid-template-columns:1fr}}
</style>
