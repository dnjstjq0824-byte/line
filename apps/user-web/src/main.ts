import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import '../../shared/design-v3.css'
import './styles/luno-v2.css'
import { reportError, setTelemetrySender } from '../../shared/monitor'
import { api, token } from './store/session'

createApp(App).use(router).mount('#app')

// F22: first-party telemetry upload (D1-backed /api/v1/telemetry, masked at
// both ends). Logged-out clients keep data local only; failures are silent
// and the diagnostics view still shows local data.
setTelemetrySender(async (payload) => {
  if (!token.value) return
  await api('/api/v1/telemetry', 'POST', { reporter: 'user-web', errors: payload.errors.slice(-20), perf: payload.perf.slice(-50) })
})
window.addEventListener('error', (event) => {
  reportError(event.error ?? event.message, { surface: 'user-web', source: 'window.onerror' })
})
window.addEventListener('unhandledrejection', (event) => {
  reportError(event.reason, { surface: 'user-web', source: 'unhandledrejection' })
})

// F18: PWA shell. Registration failure (dev server, no SW) is silent.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}
