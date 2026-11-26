import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import AuthView from './views/AuthView.vue'
import HomeView from './views/HomeView.vue'
import { ensureSession } from './store/session'
import { SITE_LANGS, SITE_LANG_ALIASES, pickSiteLang } from './site-i18n'

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
  // below is the client fallback.
  { path: '/', component: HomeView },
  { path: `/:lang(${langPattern})`, component: HomeView },
  { path: `/:alias(${aliasPattern})`, redirect: (to) => `/${SITE_LANG_ALIASES[String(to.params.alias)]}` },
  { path: '/login', component: AuthView },
  // Code-split: the messenger shell loads only after auth, keeping the
  // first-paint bundle to the login view.
  { path: '/:nav', component: () => import('./views/MessengerView.vue') },
]

const router = createRouter({ history: createWebHistory(), routes })
router.beforeEach(async (to) => {
  if (to.path === '/') return `/${pickSiteLang()}`
  if (typeof to.params.lang === 'string') return true
  // F19: no stored access token exists anymore; the guard resumes via one
  // silent cookie refresh (shared singleflight, so parallel guards cost one).
  if (to.path === '/login') return (await ensureSession()) ? '/chats' : true
  const nav = typeof to.params.nav === 'string' ? to.params.nav : ''
  if (!nav || !(NAV_PATHS as readonly string[]).includes(nav)) return '/chats'
  if (!(await ensureSession())) return '/login'
  return true
})

export default router
