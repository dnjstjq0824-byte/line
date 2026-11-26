<script setup lang="ts">
// lunotalk.com front page, one URL per language (/ko /en /ja /zh /es ...).
// Structure follows a messenger product site (header, hero with app + PC
// entry, feature rows, download cards, footer); the look is LUNO's own.
// The page scrolls inside its own container so the app shell stays fixed:
// no pull-to-refresh, no sideways drift (see luno-v2.css "Page stability").
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ensureSession, setLocale } from '../store/session'
import {
  RTL_LANGS, SITE_COPY, SITE_FOOTER_SUPPORT, SITE_LANGS, SITE_LANG_LABELS, appLocaleFor, demoOriginal,
  isSiteLang, rememberSiteLang, type SiteLang,
} from '../site-i18n'

const route = useRoute()
const router = useRouter()
const signedIn = ref(false)
onMounted(async () => {
  try { signedIn.value = await ensureSession() } catch { signedIn.value = false }
})

const lang = computed<SiteLang>(() => (isSiteLang(route.params.lang) ? route.params.lang : 'en'))
const c = computed(() => SITE_COPY[lang.value])
const footExtra = computed(() => SITE_FOOTER_SUPPORT[lang.value] || SITE_FOOTER_SUPPORT.en)
const rtl = computed(() => RTL_LANGS.includes(lang.value))
const original = computed(() => demoOriginal(lang.value))
const peerName = computed(() => (lang.value === 'th' ? 'Minji' : 'Somchai'))
const languages = SITE_LANGS.map((code) => ({ code, label: SITE_LANG_LABELS[code] }))

const subpath = computed(() => {
  const segs = route.path.split('/').filter(Boolean)
  const rest = segs.slice(1).join('/')
  return rest ? `/${rest}` : ''
})

// <html lang/dir>, title, self-referencing canonical and hreflang alternates follow the URL language.
function syncHead(l: SiteLang) {
  const html = document.documentElement
  html.lang = l
  html.dir = RTL_LANGS.includes(l) ? 'rtl' : 'ltr'
  document.title = SITE_COPY[l].title
  document.querySelectorAll('link[data-luno-alt]').forEach((n) => n.remove())
  const origin = location.origin
  const sub = subpath.value
  const add = (rel: string, href: string, hreflang?: string) => {
    const link = document.createElement('link')
    link.rel = rel
    link.href = href
    if (hreflang) link.hreflang = hreflang
    link.setAttribute('data-luno-alt', '')
    document.head.appendChild(link)
  }
  for (const code of SITE_LANGS) add('alternate', `${origin}/${code}${sub || '/'}`, code === 'zh' ? 'zh-Hans' : code === 'zh-tw' ? 'zh-Hant' : code)
  add('alternate', `${origin}/en${sub || '/'}`, 'x-default')
  const canonical = document.querySelector('link[rel=canonical]')
  if (canonical) canonical.setAttribute('href', `${origin}/${l}${sub || '/'}`)
}
watch([lang, subpath], ([l]) => syncHead(l), { immediate: true })

function chooseLanguage(ev: Event) {
  const next = (ev.target as HTMLSelectElement).value
  if (!isSiteLang(next)) return
  rememberSiteLang(next)
  setLocale(appLocaleFor(next))
  void router.push(`/${next}${subpath.value}`)
}

const features = computed(() => [
  { icon: 'translate', title: c.value.f1t, desc: c.value.f1d },
  { icon: 'call', title: c.value.f2t, desc: c.value.f2d },
  { icon: 'sticker', title: c.value.f3t, desc: c.value.f3d },
  { icon: 'qr', title: c.value.f4t, desc: c.value.f4d },
  { icon: 'group', title: c.value.f5t, desc: c.value.f5d },
])

const scroller = ref<HTMLElement | null>(null)
function jump(id: string) {
  const el = document.getElementById(id)
  if (el && scroller.value) scroller.value.scrollTo({ top: el.offsetTop - 64, behavior: 'smooth' })
}
function enter() {
  // The messenger opens in the visitor's language when it has that UI.
  setLocale(appLocaleFor(lang.value))
  // Leaving the front page: the messenger is always laid out left-to-right.
  document.documentElement.dir = 'ltr'
  router.push(signedIn.value ? '/chats' : '/login')
}
</script>

<template>
  <div ref="scroller" class="lh-page" :class="{ rtl }" :dir="rtl ? 'rtl' : 'ltr'" :lang="lang" data-testid="home-page">
    <header class="lh-header">
      <div class="lh-wrap lh-header-row">
        <a class="lh-brand" href="/" aria-label="LUNO">
          <img src="/brand/luno-symbol.svg" alt="" width="32" height="32" />
          <span>LUNO</span>
        </a>
        <nav class="lh-nav" aria-label="LUNO">
          <label class="lh-lang">
            <span class="lh-sr">{{ c.language }}</span>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-8.5 9h17M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9M12 3c-2.5 2.7-3.8 5.7-3.8 9s1.3 6.3 3.8 9"/></svg>
            <select :value="lang" :aria-label="c.language" data-testid="home-lang" @change="chooseLanguage">
              <option v-for="l in languages" :key="l.code" :value="l.code">{{ l.label }}</option>
            </select>
          </label>
          <button type="button" class="lh-nav-link" @click="jump('features')">{{ c.navFeatures }}</button>
          <button type="button" class="lh-nav-link" @click="jump('download')">{{ c.navDownload }}</button>
          <button type="button" class="lh-nav-cta" data-testid="home-login" @click="enter">
            {{ signedIn ? c.navOpen : c.navLogin }}
          </button>
        </nav>
      </div>
    </header>

    <section class="lh-hero">
      <div class="lh-wrap lh-hero-grid">
        <div class="lh-hero-copy">
          <h1>{{ c.heroTitle }}</h1>
          <p>{{ c.heroSub }}</p>
          <div class="lh-cta-row">
            <a class="lh-btn lh-btn-primary" href="/download" data-testid="home-download">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 3a1 1 0 0 1 1 1v9.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.4l3.3 3.3V4a1 1 0 0 1 1-1Zm-7 15a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z"/></svg>
              {{ c.ctaApp }}
            </a>
            <button type="button" class="lh-btn lh-btn-ghost" data-testid="home-pc" @click="enter">
              <span class="lh-only-wide">{{ signedIn ? c.ctaOpen : c.ctaPc }}</span>
              <span class="lh-only-narrow">{{ signedIn ? c.ctaOpen : c.ctaWeb }}</span>
            </button>
          </div>
          <small class="lh-hero-note">{{ c.heroNote }}</small>
        </div>
        <div class="lh-phone" aria-hidden="true">
          <div class="lh-phone-screen">
            <div class="lh-phone-top"><span class="lh-dot"></span>{{ peerName }}</div>
            <div class="lh-bubble in">
              <span dir="auto">{{ original }}</span>
              <em>{{ c.translated }} · {{ c.bubbleIn }}</em>
            </div>
            <div class="lh-out-row">
              <span class="lh-meta" aria-hidden="true"><b>✓✓</b>15:02</span>
              <div class="lh-bubble out">{{ c.bubbleOut }}</div>
            </div>
            <div class="lh-sticker">🐰💙</div>
            <div class="lh-call">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1.6l3.4-2.3A1 1 0 0 1 21 7.1v9.8a1 1 0 0 1-1.6.8L16 15.4V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"/></svg>
              <span>03:24</span>
            </div>
            <div class="lh-phone-input"><span></span><i></i></div>
          </div>
        </div>
      </div>
    </section>

    <section id="features" class="lh-features">
      <div class="lh-wrap">
        <article v-for="(f, i) in features" :key="f.icon" class="lh-feature" :class="{ flip: i % 2 === 1 }">
          <div class="lh-feature-art" :data-kind="f.icon" aria-hidden="true">
            <svg v-if="f.icon === 'translate'" viewBox="0 0 48 48"><path d="M8 10h18M17 6v4m-6 0c1 7 6 12 12 14m-3-14c-1 8-6 14-12 17" /><path d="M26 40l8-20 8 20m-13-6h10" /></svg>
            <svg v-else-if="f.icon === 'call'" viewBox="0 0 48 48"><path d="M14 8h6l3 9-4 3a24 24 0 0 0 9 9l3-4 9 3v6a4 4 0 0 1-4 4C21 38 10 27 10 12a4 4 0 0 1 4-4Z" /></svg>
            <svg v-else-if="f.icon === 'sticker'" viewBox="0 0 48 48"><circle cx="24" cy="24" r="16" /><path d="M17 28c2 3 5 4 7 4s5-1 7-4" /><circle cx="18" cy="20" r="1.5" /><circle cx="30" cy="20" r="1.5" /></svg>
            <svg v-else-if="f.icon === 'qr'" viewBox="0 0 48 48"><path d="M8 8h12v12H8zM28 8h12v12H28zM8 28h12v12H8zM28 28h4v4h-4zM36 28h4v4h-4zM28 36h4v4h-4zM36 36h4v4h-4z" /></svg>
            <svg v-else viewBox="0 0 48 48"><circle cx="17" cy="18" r="6" /><circle cx="33" cy="18" r="6" /><path d="M6 38c1-7 6-10 11-10s10 3 11 10m-4-10c2-1 4-1 9-1 5 0 10 3 11 11" /></svg>
          </div>
          <div class="lh-feature-copy">
            <h2>{{ f.title }}</h2>
            <p>{{ f.desc }}</p>
          </div>
        </article>
      </div>
    </section>

    <section id="download" class="lh-download">
      <div class="lh-wrap">
        <h2>{{ c.dlTitle }}</h2>
        <p class="lh-download-sub">{{ c.dlSub }}</p>
        <div class="lh-cards">
          <div class="lh-card">
            <strong>Android</strong>
            <span>{{ c.dlAndroidSub }}</span>
            <a class="lh-btn lh-btn-primary" href="/download">{{ c.dlAndroidBtn }}</a>
          </div>
          <div class="lh-card">
            <strong>PC · Web</strong>
            <span>{{ c.dlPcSub }}</span>
            <button type="button" class="lh-btn lh-btn-primary" @click="enter">{{ signedIn ? c.ctaOpen : c.dlPcBtn }}</button>
          </div>
          <div class="lh-card muted">
            <strong>iPhone</strong>
            <span>{{ c.dlIosSub }}</span>
            <button type="button" class="lh-btn lh-btn-ghost" disabled>{{ c.dlIosBtn }}</button>
          </div>
        </div>
      </div>
    </section>

    <footer class="lh-footer">
      <div class="lh-wrap lh-footer-row">
        <span>© 2026 LUNO</span>
        <nav class="lh-footer-langs" :aria-label="c.language">
          <RouterLink v-for="l in languages" :key="l.code" :to="`/${l.code}`" :class="{ on: l.code === lang }" @click="rememberSiteLang(l.code)">{{ l.label }}</RouterLink>
        </nav>
        <nav class="lh-footer-legal">
          <a :href="`/${lang}/terms`">{{ c.footTerms }}</a>
          <a :href="`/${lang}/privacy`">{{ c.footPrivacy }}</a>
          <a :href="`/${lang}/support`">{{ footExtra.support }}</a>
          <a :href="`/${lang}/account-deletion`">{{ footExtra.deletion }}</a>
        </nav>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.lh-page {
  --lh-blue: #315bcd;
  --lh-blue-2: #4f7cff;
  --lh-ink: #0f172a;
  --lh-muted: #475569;
  --lh-line: #e2e8f0;
  --lh-soft: #f4f7ff;
  position: absolute;
  inset: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: none;
  -webkit-overflow-scrolling: touch;
  background: #fff;
  color: var(--lh-ink);
  user-select: text;
}
.lh-wrap { width: 100%; max-width: 1120px; margin: 0 auto; padding: 0 20px; }

.lh-header { position: sticky; top: 0; z-index: 5; background: rgba(255, 255, 255, 0.94); backdrop-filter: blur(8px); border-bottom: 1px solid var(--lh-line); padding-top: env(safe-area-inset-top); }
.lh-header-row { display: flex; align-items: center; justify-content: space-between; height: 60px; gap: 12px; }
.lh-brand { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; color: var(--lh-ink); font-weight: 800; font-size: 20px; letter-spacing: 0.02em; }
.lh-nav { display: flex; align-items: center; gap: 4px; min-width: 0; }
.lh-nav-link { background: none; border: 0; padding: 8px 12px; font: inherit; font-size: 15px; color: var(--lh-muted); cursor: pointer; border-radius: 8px; }
.lh-nav-link:hover { color: var(--lh-ink); background: var(--lh-soft); }
.lh-nav-cta { border: 0; background: var(--lh-blue); color: #fff; font: inherit; font-size: 15px; font-weight: 700; padding: 9px 16px; border-radius: 999px; cursor: pointer; white-space: nowrap; }

.lh-hero { background: linear-gradient(180deg, var(--lh-soft) 0%, #fff 100%); padding: 56px 0 64px; }
.lh-hero-grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr); align-items: center; gap: 40px; }
.lh-hero-copy h1 { margin: 0; font-size: 48px; line-height: 1.2; font-weight: 800; white-space: pre-line; letter-spacing: -0.02em; }
.lh-hero-copy p { margin: 20px 0 0; font-size: 18px; line-height: 1.7; color: var(--lh-muted); white-space: pre-line; }
.lh-cta-row { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 32px; }
.lh-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 52px; padding: 0 24px; border-radius: 14px; font: inherit; font-size: 16px; font-weight: 700; text-decoration: none; cursor: pointer; border: 1px solid transparent; }
.lh-btn-primary { background: var(--lh-blue); color: #fff; }
.lh-btn-primary:hover { background: #2a4fb3; }
.lh-btn-ghost { background: #fff; color: var(--lh-blue); border-color: #c7d4f6; }
.lh-btn:disabled { opacity: 0.55; cursor: default; }
.lh-hero-note { display: block; margin-top: 14px; color: #64748b; font-size: 13px; }
.lh-only-narrow { display: none; }

.lh-phone { justify-self: center; width: 280px; max-width: 100%; aspect-ratio: 9 / 18.5; border-radius: 40px; background: #0f172a; padding: 12px; box-shadow: 0 30px 60px rgba(49, 91, 205, 0.25); }
.lh-phone-screen { height: 100%; border-radius: 30px; background: #eef2fb; display: flex; flex-direction: column; gap: 12px; padding: 18px 14px; overflow: hidden; }
.lh-phone-top { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px; padding-bottom: 10px; border-bottom: 1px solid #dbe3f5; }
.lh-dot { width: 26px; height: 26px; border-radius: 50%; background: linear-gradient(135deg, #f59e0b, #ef4444); }
.lh-bubble { max-width: 82%; padding: 10px 12px; border-radius: 16px; font-size: 13px; line-height: 1.45; }
.lh-bubble.in { align-self: flex-start; background: #fff; border-top-left-radius: 4px; }
.lh-bubble.in em { display: block; margin-top: 6px; padding-top: 6px; border-top: 1px dashed #dbe3f5; font-style: normal; color: var(--lh-blue); font-size: 12px; }
.lh-bubble.out { align-self: flex-end; background: var(--lh-blue-2); color: #fff; border-top-right-radius: 4px; }
.lh-sticker { align-self: flex-end; font-size: 44px; line-height: 1; }
.lh-out-row { align-self: flex-end; display: flex; align-items: flex-end; gap: 6px; max-width: 92%; }
.lh-out-row .lh-bubble.out { max-width: none; }
.lh-meta { display: flex; flex-direction: column; align-items: flex-end; font-size: 10px; color: #64748b; line-height: 1.3; white-space: nowrap; }
.lh-meta b { color: var(--lh-blue-2); font-weight: 700; }
.lh-call { align-self: flex-start; display: inline-flex; align-items: center; gap: 8px; background: #fff; color: var(--lh-blue); border-radius: 16px; border-top-left-radius: 4px; padding: 10px 14px; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
.lh-page[lang="ko"] { word-break: keep-all; }
.lh-phone-input { margin-top: auto; display: flex; gap: 8px; align-items: center; }
.lh-phone-input span { flex: 1; height: 34px; border-radius: 17px; background: #fff; }
.lh-phone-input i { width: 34px; height: 34px; border-radius: 50%; background: var(--lh-blue); }

.lh-features { padding: 72px 0 24px; }
.lh-feature { display: grid; grid-template-columns: 200px minmax(0, 1fr); align-items: center; gap: 40px; padding: 28px 0; border-bottom: 1px solid var(--lh-line); }
.lh-feature:last-child { border-bottom: 0; }
.lh-feature.flip { grid-template-columns: minmax(0, 1fr) 200px; }
.lh-feature.flip .lh-feature-art { order: 2; }
.lh-feature-art { width: 160px; height: 160px; justify-self: center; border-radius: 40px; background: var(--lh-soft); display: grid; place-items: center; }
.lh-feature-art svg { width: 76px; height: 76px; fill: none; stroke: var(--lh-blue); stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
.lh-feature-art[data-kind='qr'] svg { fill: var(--lh-blue); stroke: none; }
.lh-feature-copy h2 { margin: 0; font-size: 28px; line-height: 1.35; font-weight: 800; }
.lh-feature-copy p { margin: 12px 0 0; font-size: 17px; line-height: 1.75; color: var(--lh-muted); }

.lh-download { background: var(--lh-soft); padding: 72px 0; text-align: center; }
.lh-download h2 { margin: 0; font-size: 32px; font-weight: 800; }
.lh-download-sub { margin: 10px 0 0; color: var(--lh-muted); font-size: 17px; }
.lh-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-top: 36px; }
.lh-card { background: #fff; border: 1px solid var(--lh-line); border-radius: 20px; padding: 28px 20px; display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 0; }
.lh-card strong { font-size: 20px; }
.lh-card span { color: var(--lh-muted); font-size: 14px; }
.lh-card .lh-btn { margin-top: 12px; width: 100%; max-width: 220px; }
.lh-card.muted { opacity: 0.8; }

.lh-footer { border-top: 1px solid var(--lh-line); padding: 24px 0 calc(24px + env(safe-area-inset-bottom)); color: #64748b; font-size: 13px; }
.lh-footer-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.lh-footer nav { display: flex; gap: 10px 16px; flex-wrap: wrap; }
.lh-footer a { color: inherit; text-decoration: none; }
.lh-footer a:hover { color: var(--lh-ink); }
.lh-footer-langs { flex-basis: 100%; order: -1; flex-wrap: wrap; gap: 6px 14px !important; padding-bottom: 12px; margin-bottom: 4px; border-bottom: 1px solid var(--lh-line); }
.lh-footer-langs a.on { color: var(--lh-blue); font-weight: 700; }
.lh-lang { position: relative; display: inline-flex; align-items: center; gap: 4px; color: var(--lh-muted); margin-inline-end: 4px; }
.lh-lang select { appearance: none; -webkit-appearance: none; border: 1px solid var(--lh-line); background: #fff; color: var(--lh-ink); font: inherit; font-size: 16px; height: 38px; padding: 0 10px; border-radius: 10px; max-width: 150px; cursor: pointer; }
.lh-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.lh-page.rtl .lh-hero-copy h1, .lh-page.rtl .lh-hero-copy p { letter-spacing: 0; }

:global([data-theme="dark"]) .lh-page {
  --lh-blue: #6b93ff;
  --lh-blue-2: #4f7cff;
  --lh-ink: #f1f5f9;
  --lh-muted: #94a3b8;
  --lh-line: #1e293b;
  --lh-soft: #111c30;
  background: #0b1220;
}
:global([data-theme="dark"]) .lh-header { background: rgba(11, 18, 32, 0.92); }
:global([data-theme="dark"]) .lh-hero { background: linear-gradient(180deg, #111c30 0%, #0b1220 100%); }
:global([data-theme="dark"]) .lh-btn-ghost { background: #111c30; color: #93b4ff; border-color: #2a3e66; }
:global([data-theme="dark"]) .lh-card { background: #111c30; }
:global([data-theme="dark"]) .lh-lang select { background: #111c30; color: #f1f5f9; border-color: #24324a; }
:global([data-theme="dark"]) .lh-phone-screen { background: #0f1b2e; }
:global([data-theme="dark"]) .lh-phone-top { border-bottom-color: #1e293b; color: #f1f5f9; }
:global([data-theme="dark"]) .lh-bubble.in,
:global([data-theme="dark"]) .lh-call { background: #192842; color: #f1f5f9; }
:global([data-theme="dark"]) .lh-bubble.in em { border-top-color: #293e63; color: #8fb0ff; }
:global([data-theme="dark"]) .lh-phone-input span { background: #192842; }

@media (max-width: 1099px) {
  .lh-hero { padding: 36px 0 48px; }
  .lh-hero-grid { grid-template-columns: minmax(0, 1fr); gap: 36px; }
  .lh-hero-copy { text-align: center; }
  .lh-hero-copy h1 { font-size: 34px; }
  .lh-hero-copy p { font-size: 16px; }
  .lh-cta-row { justify-content: center; }
  .lh-phone { width: 240px; }
  .lh-feature, .lh-feature.flip { grid-template-columns: minmax(0, 1fr); gap: 16px; text-align: center; padding: 32px 0; }
  .lh-feature.flip .lh-feature-art { order: 0; }
  .lh-feature-art { width: 120px; height: 120px; border-radius: 32px; }
  .lh-feature-art svg { width: 58px; height: 58px; }
  .lh-feature-copy h2 { font-size: 22px; }
  .lh-feature-copy p { font-size: 15px; }
  .lh-cards { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 699px) {
  .lh-hero-copy p { white-space: normal; }
  .lh-wrap { padding: 0 16px; }
  .lh-lang svg { display: none; }
  .lh-lang select { max-width: 112px; height: 36px; padding: 0 8px; }
  /* the hero already has both entry buttons; long labels (ar, de, ...) would clip here */
  .lh-nav-cta { display: none; }
  .lh-nav-link { display: none; }
  .lh-only-wide { display: none; }
  .lh-only-narrow { display: inline; }
  .lh-hero-copy h1 { font-size: 30px; }
  .lh-hero-copy p br { display: none; }
  .lh-cta-row { flex-direction: column; align-items: stretch; }
  .lh-btn { width: 100%; }
}
</style>
