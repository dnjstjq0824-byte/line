import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import AuthView from './views/AuthView.vue'
import MessengerView from './views/MessengerView.vue'
import { readStoredToken } from './store/session'

// Menu = URL: every reachable pane has an independent address.
export const NAV_PATHS = ['chats', 'home', 'news', 'calls', 'voom', 'openchat', 'wallet'] as const
export type NavPath = (typeof NAV_PATHS)[number]

const routes: RouteRecordRaw[] = [
  { path: '/login', component: AuthView },
  { path: '/:nav?', component: MessengerView },
]

const router = createRouter({ history: createWebHistory(), routes })
router.beforeEach((to) => {
  if (to.path === '/login') return readStoredToken() ? '/chats' : true
  const nav = typeof to.params.nav === 'string' ? to.params.nav : ''
  if (!nav || !(NAV_PATHS as readonly string[]).includes(nav)) return '/chats'
  if (!readStoredToken()) return '/login'
  return true
})

export default router
