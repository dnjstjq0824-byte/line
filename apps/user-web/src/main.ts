import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './components/luno-design-tokens.css'
import './luno-theme.css'
import './luno-theme-advanced.css'
import './styles/luno-design-tokens.css'
import './styles/open-messenger-tokens.css'
import '../../shared/design-v2.css'
import '../../shared/design-v3.css'
import './styles/luno-v2.css'

createApp(App).use(router).mount('#app')
