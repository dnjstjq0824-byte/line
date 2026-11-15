import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import '../../shared/design-v3.css'
import './styles/luno-v2.css'

createApp(App).use(router).mount('#app')

// F18: PWA shell. Registration failure (dev server, no SW) is silent.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}
