import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import AuthView from './views/AuthView.vue'
import HomeView from './views/HomeView.vue'
import { ensureSession } from './store/session'
import { SITE_LANGS, SITE_LANG_ALIASES, pickSiteLang } from './site-i18n'
import { classifyHost } from '../../shared/locale.config'

// Menu = URL: every reachable pane has an independent address.
export const NAV_PATHS = ['chats', 'home', 'news', 'calls', 'voom', 'openchat', 'wallet', 'shop'] as const
export type NavPath = (typeof NAV_PATHS)[number]
// P2 split: view-local nav vocabulary, moved verbatim from views/MessengerView.vue
// (NavPath covers routable panes; NavItem adds rail-only actions).
export type NavItem =
  | 'home'
  | 'chats'
  | 'news'
  | 'calls'
  | 'voom'
  | 'openchat'
  | 'wallet'
  | 'shop'
  | 'add-friends'
  | 'open-search'
  | 'open-mail'
  | 'open-apps'
  | 'open-video'
  | 'open-stream'
  | 'open-ai'
  | 'open-services'

const langPattern = SITE_LANGS.join('|')
const aliasPattern = Object.keys(SITE_LANG_ALIASES).join('|')

const routes: RouteRecordRaw[] = [
  // lunotalk.com front page, one URL per language. "/" is normally
  // redirected by the server (cookie > Geo-IP > Accept-Language); the guard
  // below is the client fallback. On web.{domain} the SPA opens directly.
  { path: '/', component: HomeView },
  { path: `/:lang(${langPattern})`, component: HomeView },
  { path: `/:lang(${langPattern})/features`, component: HomeView },
  { path: `/:lang(${langPattern})/download`, component: HomeView },
  { path: `/:alias(${aliasPattern})`, redirect: (to) => `/${SITE_LANG_ALIASES[String(to.params.alias)]}` },
  { path: '/login', component: AuthView },
  // SPA deep-link & room routes (no language prefix on web.{domain})
  { path: '/invite/:code', component: () => import('./views/MessengerView.vue') },
  { path: '/rooms/:roomId', component: () => import('./views/MessengerView.vue') },
  { path: '/settings', component: () => import('./views/MessengerView.vue') },
  // Code-split: the messenger shell loads only after auth, keeping the
  // first-paint bundle to the login view.
  { path: '/:nav', component: () => import('./views/MessengerView.vue') },
]

function ensureNoIndexMeta() {
  if (typeof document === 'undefined') return
  let meta = document.querySelector('meta[name="robots"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'robots')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', 'noindex, nofollow')
}

const isWebSubdomain = typeof window !== 'undefined' && classifyHost(window.location.hostname).role === 'web'
if (isWebSubdomain) ensureNoIndexMeta()

const router = createRouter({ history: createWebHistory(), routes })
router.beforeEach(async (to) => {
  if (isWebSubdomain) ensureNoIndexMeta()
  if (to.path === '/') {
    if (isWebSubdomain) return (await ensureSession()) ? '/chats' : '/login'
    return `/${pickSiteLang()}`
  }
  if (typeof to.params.lang === 'string') return true
  // F19: no stored access token exists anymore; the guard resumes via one
  // silent cookie refresh (shared singleflight, so parallel guards cost one).
  if (to.path === '/login') return (await ensureSession()) ? '/chats' : true
  if (to.path.startsWith('/invite/') || to.path.startsWith('/rooms/') || to.path === '/settings') {
    if (!(await ensureSession())) return '/login'
    return true
  }
  const nav = typeof to.params.nav === 'string' ? to.params.nav : ''
  if (!nav || !(NAV_PATHS as readonly string[]).includes(nav)) return '/chats'
  if (!(await ensureSession())) return '/login'
  return true
})

export default router
