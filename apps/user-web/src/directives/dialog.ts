// v-dialog: shared behaviour for every popup that sits on a .modal-backdrop.
//
//   <div class="modal-backdrop" v-dialog="() => emit('close')" @click.self="emit('close')">
//     <div class="standard-modal-box">…</div>
//   </div>
//
// - The panel gets role="dialog", aria-modal and a label taken from its
//   heading when the template did not give one.
// - Escape closes only the topmost dialog (a stack), so a password dialog
//   opened over Settings closes alone. Passing no handler makes Escape inert
//   (for flows that must not be dismissed by accident).
// - Tab and Shift+Tab stay inside the dialog.
// - Focus moves into the dialog when it opens and returns to the control
//   that opened it when it closes. Text fields are only auto-focused on
//   devices with a fine pointer, so phones do not pop the keyboard.
// - The page behind does not scroll while any dialog is open.
import type { Directive } from 'vue'

type CloseHandler = (() => void) | null | undefined

interface DialogState {
  close: CloseHandler
  returnFocus: HTMLElement | null
  onKeydown: (event: KeyboardEvent) => void
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const stack: HTMLElement[] = []
const states = new WeakMap<HTMLElement, DialogState>()
let labelSeq = 0

function panelOf(backdrop: HTMLElement): HTMLElement {
  return (backdrop.querySelector('[role="dialog"]') as HTMLElement | null)
    || (backdrop.firstElementChild as HTMLElement | null)
    || backdrop
}

function focusables(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((el) => el.offsetParent !== null || el === document.activeElement)
}

function labelPanel(panel: HTMLElement) {
  panel.setAttribute('role', 'dialog')
  if (!panel.hasAttribute('aria-modal')) panel.setAttribute('aria-modal', 'true')
  if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1')
  if (panel.hasAttribute('aria-label') || panel.hasAttribute('aria-labelledby')) return
  const heading = panel.querySelector<HTMLElement>('h1, h2, h3')
  if (!heading) return
  if (!heading.id) heading.id = `ln-dialog-title-${++labelSeq}`
  panel.setAttribute('aria-labelledby', heading.id)
}

function initialFocus(panel: HTMLElement) {
  const finePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches
  const explicit = panel.querySelector<HTMLElement>('[autofocus], [data-autofocus]')
  const field = finePointer
    ? panel.querySelector<HTMLElement>('input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea:not([disabled]), select:not([disabled])')
    : null
  const target = explicit || field || panel
  target.focus({ preventScroll: true })
}

function syncScrollLock() {
  document.documentElement.classList.toggle('ln-dialog-open', stack.length > 0)
}

export const vDialog: Directive<HTMLElement, CloseHandler> = {
  mounted(el, binding) {
    const panel = panelOf(el)
    labelPanel(panel)
    const active = document.activeElement
    const state: DialogState = {
      close: binding.value,
      returnFocus: active instanceof HTMLElement && active !== document.body ? active : null,
      onKeydown(event: KeyboardEvent) {
        if (stack[stack.length - 1] !== el) return
        if (event.key === 'Escape') {
          if (!state.close || event.isComposing) return
          event.preventDefault()
          event.stopPropagation()
          state.close()
          return
        }
        if (event.key !== 'Tab') return
        const items = focusables(panel)
        if (!items.length) {
          event.preventDefault()
          panel.focus({ preventScroll: true })
          return
        }
        const first = items[0]
        const last = items[items.length - 1]
        const current = document.activeElement
        const outside = !panel.contains(current)
        if (event.shiftKey && (current === first || current === panel || outside)) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && (current === last || outside)) {
          event.preventDefault()
          first.focus()
        }
      },
    }
    states.set(el, state)
    stack.push(el)
    syncScrollLock()
    document.addEventListener('keydown', state.onKeydown, true)
    requestAnimationFrame(() => {
      if (el.isConnected && !panel.contains(document.activeElement)) initialFocus(panel)
    })
  },
  updated(el, binding) {
    const state = states.get(el)
    if (state) state.close = binding.value
  },
  unmounted(el) {
    const state = states.get(el)
    if (!state) return
    document.removeEventListener('keydown', state.onKeydown, true)
    const index = stack.indexOf(el)
    if (index >= 0) stack.splice(index, 1)
    states.delete(el)
    syncScrollLock()
    const back = state.returnFocus
    if (back && back.isConnected && !stack.length) back.focus({ preventScroll: true })
  },
}
