import fs from 'fs';
import path from 'path';

const appPath = path.resolve('apps/user-web/src/App.vue');
let code = fs.readFileSync(appPath, 'utf8');

// 1. Add state & methods
const stateAnchor = "const replyToMessage = ref<Message | null>(null)";
const stateAdditions = `const replyToMessage = ref<Message | null>(null)
// --- Official Account Rich Menu ---
const activeRichMenu = ref<{ id: string; title: string; layout?: 'grid_2x3' | 'grid_1x3'; tiles: Array<{ id: string; label: string; icon: string; action: { type: string; text?: string; uri?: string; data?: string } }> } | null>(null)
const showRichMenu = ref(true)

async function loadConversationRichMenu(cid: string) {
  activeRichMenu.value = null
  if (!cid) return
  try {
    const res = await api<{ rich_menu: any }>(\`/api/v1/conversations/\${cid}/rich-menu\`)
    if (res && res.rich_menu) {
      activeRichMenu.value = res.rich_menu
      showRichMenu.value = true
    }
  } catch {
    activeRichMenu.value = null
  }
}

function onRichMenuTileClick(tile: any) {
  if (!tile || !tile.action) return
  if (tile.action.type === 'message') {
    draftMessage.value = tile.action.text || tile.label
    void sendMessage()
  } else if (tile.action.type === 'uri') {
    if (tile.action.uri) window.open(tile.action.uri, '_blank')
  } else if (tile.action.type === 'postback') {
    draftMessage.value = \`[포스트백] \${tile.action.data || tile.label}\`
    void sendMessage()
  }
}`;

if (!code.includes('activeRichMenu = ref')) {
  code = code.replace(stateAnchor, stateAdditions);
}

// 2. Call loadConversationRichMenu in selectChat
const selectChatAnchor = `    scrollToBottom()
    await Promise.all([loadChats(), loadPolls(convId)])`;

const selectChatReplacement = `    scrollToBottom()
    const targetChat = chats.value.find(c => c.id === convId)
    if (targetChat && (targetChat.official || convId.includes('oa-'))) {
      void loadConversationRichMenu(convId)
    } else {
      activeRichMenu.value = null
    }
    await Promise.all([loadChats(), loadPolls(convId)])`;

if (code.includes('await Promise.all([loadChats(), loadPolls(convId)])') && !code.includes('loadConversationRichMenu(convId)')) {
  code = code.replace(selectChatAnchor, selectChatReplacement);
}

// 3. Render Rich Menu in template above pc-input-toolbar
const templateAnchor = `          <!-- Attachment Bar Icons -->
          <div class="pc-input-toolbar">`;

const templateReplacement = `          <!-- Official Account Interactive Rich Menu (LINE-style) -->
          <div v-if="activeRichMenu && (selectedChat?.official || selectedChatId.includes('oa-'))" class="pc-rich-menu-container">
            <div class="rich-menu-toggle-bar" @click="showRichMenu = !showRichMenu">
              <span class="rich-menu-title">{{ activeRichMenu.title || '공식 채널 메뉴' }}</span>
              <button type="button" class="btn-rich-menu-toggle">
                {{ showRichMenu ? '▼ 메뉴 닫기' : '▲ 메뉴 열기' }}
              </button>
            </div>
            <div v-if="showRichMenu" class="rich-menu-grid" :class="activeRichMenu.layout || 'grid_2x3'">
              <div
                v-for="tile in (activeRichMenu.layout === 'grid_1x3' ? activeRichMenu.tiles.slice(0, 3) : activeRichMenu.tiles.slice(0, 6))"
                :key="tile.id"
                class="rich-menu-tile-card"
                @click="onRichMenuTileClick(tile)"
              >
                <span class="tile-icon">{{ tile.icon || '📌' }}</span>
                <span class="tile-label">{{ tile.label }}</span>
              </div>
            </div>
          </div>

          <!-- Attachment Bar Icons -->
          <div class="pc-input-toolbar">`;

if (code.includes('<!-- Attachment Bar Icons -->') && !code.includes('pc-rich-menu-container')) {
  code = code.replace(templateAnchor, templateReplacement);
}

fs.writeFileSync(appPath, code, 'utf8');
console.log('Successfully patched Rich Menu into user-web App.vue');

