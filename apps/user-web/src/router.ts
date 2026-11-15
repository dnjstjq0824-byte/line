import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import AuthView from './views/AuthView.vue'
import { ensureSession } from './store/session'

// Menu = URL: every reachable pane has an independent address.
export const NAV_PATHS = ['chats', 'home', 'news', 'calls', 'voom', 'openchat', 'wallet', 'shop'] as const
export type NavPath = (typeof NAV_PATHS)[number]

const routes: RouteRecordRaw[] = [
  { path: '/login', component: AuthView },
  // Code-split: the messenger shell loads only after auth, keeping the
  // first-paint bundle to the login view.
  { path: '/:nav?', component: () => import('./views/MessengerView.vue') },
]

const router = createRouter({ history: createWebHistory(), routes })
router.beforeEach(async (to) => {
  // F19: no stored access token exists anymore; the guard resumes via one
  // silent cookie refresh (shared singleflight, so parallel guards cost one).
  if (to.path === '/login') return (await ensureSession()) ? '/chats' : true
  const nav = typeof to.params.nav === 'string' ? to.params.nav : ''
  if (!nav || !(NAV_PATHS as readonly string[]).includes(nav)) return '/chats'
  if (!(await ensureSession())) return '/login'
  return true
})

export default router
