import type { Attrs } from '../jsx-runtime'
import { behavior, mark, patch } from '../render'
import './Popover.css'

/** CSS transform-origin keywords: a side, or a vertical and horizontal pair. */
export type PopoverOrigin = 'top' | 'bottom' | 'left' | 'right' | 'center' | `${'top' | 'bottom' | 'center'} ${'left' | 'right' | 'center'}` | `${'left' | 'right'} center`

/**
 * A floating surface anchored to something: a menu, a snooze picker, a prompt
 * bar under a selection. It fades and scales a touch from `origin`, the side
 * nearest its trigger; the box itself never resizes while it opens. Position
 * it from rect() of the trigger.
 */
export function Popover({ show, origin = 'top left', className, style, children, ...rest }: Attrs & { show: boolean; origin?: PopoverOrigin }) {
  behavior('popover', holding)
  return (
    <div {...rest} className={`ss-popover${className ? ` ${className}` : ''}`} data-ss-part="popover" data-show={show || undefined} style={{ '--ss-popover-origin': origin, ...style }}>
      {children}
    </div>
  )
}

// Closing, it keeps the place and contents it had open: a scene that resets
// the anchor or the items as it closes would otherwise make the fading
// popover jump or change under the eye. Once it has faded, it lets go and
// takes the live render instantly, out of sight, so a change made while it
// was hidden (a list reset for the next loop) doesn't play when it reopens.
function holding(el: HTMLElement) {
  let shown = el.hasAttribute('data-show')
  // The latest render while it holds, applied once it lets go
  let owed: Element | null = null
  let timer = 0
  const release = () => {
    timer = 0
    mark(el, 'data-instant')
    if (!owed) return
    const next = owed
    owed = null
    el.setAttribute('style', next.getAttribute('style') ?? '')
    patch(el, next.innerHTML)
  }
  return {
    morph(next: Element) {
      const show = next.hasAttribute('data-show')
      if (show) {
        clearTimeout(timer)
        timer = 0
        owed = null
        shown = true
        mark(el, 'data-instant', null)
        return
      }
      if (shown) {
        shown = false
        timer = window.setTimeout(release, 320)
      }
      if (!timer) return
      // Still fading: hold the open place and contents
      owed = next.cloneNode(true) as Element
      next.setAttribute('style', el.getAttribute('style') ?? '')
      return false
    },
    destroy() {
      clearTimeout(timer)
    },
  }
}
