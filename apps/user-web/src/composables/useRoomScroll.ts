// Room canvas scroll (P2 MessengerView split). Owns the canvas element ref
// and bottom-scroll; no view bindings.
// Extracted verbatim from views/MessengerView.vue.
import { ref } from 'vue'

export function useRoomScroll() {
  const messagesCanvasRef = ref<HTMLElement | null>(null)

  function scrollToBottom() {
    setTimeout(() => {
      if (messagesCanvasRef.value) {
        messagesCanvasRef.value.scrollTop = messagesCanvasRef.value.scrollHeight
      }
    }, 40)
  }

  return {
    messagesCanvasRef,
    scrollToBottom,
  }
}
