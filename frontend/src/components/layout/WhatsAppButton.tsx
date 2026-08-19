import { MessageCircle } from 'lucide-react'
import { WHATSAPP_NUMBER } from '@/lib/constants'

/**
 * Support shortcut. Styled in brand colour rather than WhatsApp green so it
 * reads as part of the product, not a bolted-on widget.
 */
export function WhatsAppButton() {
  const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    "Hi Write Chap Chap, I need help with…",
  )}`

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-full bg-solid-brand py-3 pl-3.5 pr-4 text-sm font-semibold text-white shadow-glow transition-all hover:bg-solid-brand-hover hover:shadow-card-hover sm:bottom-6 sm:right-6"
      aria-label="Chat with support on WhatsApp"
    >
      <span className="relative flex h-5 w-5 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-white/40 animate-pulse-ring" />
        <MessageCircle className="relative h-5 w-5" />
      </span>
      <span className="hidden sm:inline">Need help?</span>
    </a>
  )
}
