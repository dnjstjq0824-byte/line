import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './components/line-design-tokens.css'
import './line-theme.css'
import './line-theme-advanced.css'
import './styles/luno-design-tokens.css'
import './styles/open-messenger-tokens.css'
import '../../shared/design-v2.css'
import '../../shared/design-v3.css'
import './styles/luno-v2.css'

createApp(App).use(router).mount('#app')
