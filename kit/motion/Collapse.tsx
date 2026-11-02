import type { Attrs, Child } from '../jsx-runtime'
import { behavior, mark } from '../render'
import './Collapse.css'

/**
 * Opens and closes its content's height, so what comes after moves with it:
 * a row leaving a list, a log panel opening under a status. Closing dims the
 * content fast and dissolves it over the whole of the height's travel, so a
 * row is faint by the time the edge reaches it and the space is never seen
 * empty; opening brings the content with its height. Children can have any height or
 * padding. The inner box is a deliberate crop (film.mjs skips it) and clips
 * 3px wide, so rings and shadows on the content aren't shaved.
 */
export function Collapse({ open, reveal = 'clip', from = 'above', solid = false, children, className, ...rest }: Attrs & {
  open: boolean
  /**
   * clip: the opening space uncovers the content, for rows and text. The
   * content is faint while the edge passes it, so nothing is ever seen sliced.
   * drop: the space opens and the content arrives whole, gliding into place.
   * For cards and messages: a notification, a toast, a chat message.
   */
  reveal?: 'clip' | 'drop'
  /** Where drop content comes from: 'above' (a notification), or 'below' (a chat message landing at the bottom of a feed). */
  from?: 'above' | 'below'
  /**
   * Opaque throughout: the height opens and closes over the content without
   * fading it. For a surface unlike the ground (a dark log panel on a light
   * window), which would otherwise pass through gray. Its content is there
   * from the first frame: open it with what it shows, never empty.
   */
  solid?: boolean
  children: Child
}) {
  behavior('collapse', collapsing)
  return (
    <div
      {...rest}
      className={`ss-collapse${className ? ` ${className}` : ''}`}
      data-ss-part="collapse"
      data-open={open || undefined}
      data-reveal={reveal}
      data-solid={solid || undefined}
      data-from={reveal === 'drop' ? from : undefined}
    >
      <div className="ss-collapse__inner" data-crop={reveal === 'clip' || undefined}>
        {children}
      </div>
    </div>
  )
}

// Marked moving from the render that changes open until the height settles,
// and tall when the content is taller than a row: unfolding from the middle
// would cut its first line while it's already visible, so it reveals from
// the top and fades in late
function collapsing(el: HTMLElement) {
  let open = el.hasAttribute('data-open')
  let timer = 0
  const settled = (e: TransitionEvent) => {
    if (e.target === el && e.propertyName === 'grid-template-rows') mark(el, 'data-moving', null)
  }
  el.addEventListener('transitionend', settled)
  return {
    morph(next: Element) {
      const now = next.hasAttribute('data-open')
      if (now === open) return
      open = now
      mark(el, 'data-moving')
      next.setAttribute('data-moving', '')
      // No transitionend without a transition (reduced motion): never leave it moving
      clearTimeout(timer)
      timer = window.setTimeout(() => mark(el, 'data-moving', null), 900)
    },
    update() {
      const h = el.firstElementChild?.scrollHeight ?? 0
      if (h) mark(el, 'data-tall', h > 44)
    },
    destroy() {
      clearTimeout(timer)
      el.removeEventListener('transitionend', settled)
    },
  }
}
