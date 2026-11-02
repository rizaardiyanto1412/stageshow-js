import type { Child, Style } from '../jsx-runtime'
import { behavior, hold, mark, stillAt } from '../render'
import './Swap.css'

/**
 * Text (or anything) replaced in place: the old fades out, the new fades in,
 * and the box eases between their sizes so the lines around it move with it,
 * never snap. Key it on what changed: `<Swap id={step}>{text}</Swap>`.
 */
export function Swap({ id, children, duration = 450, className, style, ...rest }: { id: string | number; children: Child; duration?: number; className?: string; style?: Style } & Record<`data-${string}`, unknown>) {
  behavior('swap', swapping)
  return (
    <span {...rest} className={`ss-swap${className ? ` ${className}` : ''}`} data-ss-part="swap" data-swap-id={id} data-duration={duration} style={style}>
      {/* Keyed on the id, so each new content arrives as a new element and fades in */}
      <span key={`c${id}`} className="ss-swap__in" style={{ animationDuration: `${duration}ms` }}>
        {children}
      </span>
    </span>
  )
}

function swapping(box: HTMLElement) {
  let shownId = box.dataset.swapId
  let size: { w: number; h: number } | null = null
  // The width the old words had, while they fade
  let prev: { w?: number } | null = null
  let done = 0
  const inner = () => box.querySelector<HTMLElement>(':scope > .ss-swap__in')
  const duration = () => Number(box.dataset.duration ?? 450)

  // Measured with the box at its natural size for one synchronous read: the
  // box still holds the old size, and longer text measured inside it would
  // be squeezed to the old width. Restored before the browser paints.
  const natural = () => {
    const el = inner()
    if (!el) return null
    const { width, height, transition } = box.style
    const own = { width: el.style.width, maxWidth: el.style.maxWidth }
    box.style.transition = 'none'
    box.style.width = ''
    box.style.height = ''
    el.style.width = ''
    el.style.maxWidth = ''
    // The exact used size, not offsetWidth: that rounds down, and a label
    // a fraction of a pixel wider than its box wraps onto two lines.
    // Computed style also ignores the stage's own scale
    const cs = getComputedStyle(el)
    const w = parseFloat(cs.width) || 0
    const h = parseFloat(cs.height) || 0
    el.style.width = own.width
    el.style.maxWidth = own.maxWidth
    box.style.width = width
    box.style.height = height
    void box.offsetWidth
    box.style.transition = transition
    return { w, h }
  }
  const apply = () => {
    const s = natural()
    if (!s || (size && size.w === s.w && size.h === s.h)) return
    size = s
    hold(box, 'width', `${s.w}px`)
    hold(box, 'height', `${s.h}px`)
  }
  // Kept current after a swap too: a font or the demo's own CSS arriving
  // late changes the size without one. Not while a swap's size transition
  // runs: measuring then would cancel it and snap the box to its end.
  const ro = new ResizeObserver(() => {
    if (!prev) apply()
  })
  let watched: HTMLElement | null = null
  const watch = () => {
    const el = inner()
    if (el === watched) return
    if (watched) ro.unobserve(watched)
    watched = el
    if (el) ro.observe(el)
  }

  const finish = () => {
    done = 0
    prev = null
    box.querySelector(':scope > .ss-swap__out')?.remove()
    hold(box, 'transition', 'none')
    hold(inner(), 'width', null)
    hold(inner(), 'max-width', null)
    mark(box, 'data-swapping', null)
  }

  // A new id arrived in this render: the old content is now the fading copy
  let started = false
  return {
    morph(next: Element) {
      const id = (next as HTMLElement).dataset.swapId
      if (id === shownId) return
      shownId = id
      clearTimeout(done)
      box.querySelector(':scope > .ss-swap__out')?.remove()
      if (stillAt(box)) {
        prev = null
        return
      }
      const el = inner()
      // The old words keep the width they had, so they never rewrap as the box
      // narrows under them
      prev = { w: size?.w }
      if (el) {
        const out = el.cloneNode(true) as HTMLElement
        out.className = 'ss-swap__out'
        out.setAttribute('data-ss-own', '')
        out.removeAttribute('data-ss-key')
        out.style.cssText = `animation-duration:${duration() * 0.5}ms;${prev.w === undefined ? '' : `width:${prev.w}px;max-width:none`}`
        box.prepend(out)
      }
      started = true
    },
    update() {
      watch()
      if (!started) {
        if (!prev) apply()
        return
      }
      started = false
      const ms = duration()
      const s = natural()
      if (!s) return
      // Narrowing, the box waits while the old words fade, so they are never cut
      // by its edge mid-word; widening, it opens at once for the new ones
      const shrink = prev?.w !== undefined && s.w < prev.w
      // The soft edge is for words passing a moving edge: an image swapped for
      // one the same size keeps its own edges
      const resizing = prev?.w !== undefined && s.w !== prev.w
      mark(box, 'data-swapping', resizing)
      hold(box, 'transition', `width ${ms}ms cubic-bezier(0.25, 0.8, 0.25, 1) ${shrink ? Math.round(ms * 0.5) : 0}ms, height ${ms}ms cubic-bezier(0.25, 0.8, 0.25, 1)`)
      size = s
      hold(box, 'width', `${s.w}px`)
      hold(box, 'height', `${s.h}px`)
      // While the box eases, the new words are already at their final width:
      // capped by the old box they would wrap until it caught up. The box
      // clips them sideways meanwhile
      hold(inner(), 'width', `${s.w}px`)
      hold(inner(), 'max-width', 'none')
      done = window.setTimeout(finish, ms)
    },
    destroy() {
      clearTimeout(done)
      ro.disconnect()
    },
  }
}
