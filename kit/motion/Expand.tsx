import { styleText, type Attrs, type Child, type Style } from '../jsx-runtime'
import { behavior, reduced as reducedMotion } from '../render'
import type { Rect } from '../measure'
import './Expand.css'

/**
 * A card that opens into a full screen: one element, never a swap. Closed, it
 * is clipped to `from` (the card's rect from a.rect, in stage pixels; it is
 * converted for you, also inside a Phone, whose screen is scaled again) with
 * its corners; open, the clip releases to the whole parent.
 *
 * Without `face`, as iOS opens an App Store card: lay the children out as the
 * open screen, top-aligned so the card's header is the screen's header; the
 * content rides with the card and settles at the top.
 *
 * With `face`, as iOS opens an app out of a notification or an icon: `face` is
 * the closed thing's own look (render the notification again). The whole app,
 * laid out full size, is scaled down onto it and zooms up to fill the screen,
 * its top showing first; the face blows up with it and fades, so the app grows
 * out of the banner. Give the app's background as `--ss-expand-bg`.
 * `radius` is the card's corner. `duration` defaults to 520ms for a card and
 * 640ms for a launch.
 */
export function Expand({ open, from, radius = 16, duration, face, children, className, style, ...rest }: Attrs & { open: boolean; from: Rect; radius?: number; duration?: number; face?: Child }) {
  behavior('expand', expanding)
  const launch = face !== undefined
  const ms = reducedMotion() ? 0 : (duration ?? (launch ? 640 : 520))
  // Not shown until the behavior has measured where the parent sits: the
  // first frame of a still is the open screen, or nothing
  const s = { visibility: open ? undefined : 'hidden', ...style } as Style
  return (
    <div
      {...rest}
      className={`ss-expand${className ? ` ${className}` : ''}`}
      data-ss-part="expand"
      data-open={open || undefined}
      data-launch={launch ? '' : undefined}
      data-from={`${from.x},${from.y},${from.width},${from.height}`}
      data-radius={radius}
      data-ms={ms}
      data-style={style ? styleText(style) : undefined}
      style={s}
    >
      <div className="ss-expand__content">{children}</div>
      {launch && <div className="ss-expand__face">{face}</div>}
    </div>
  )
}

// Where the parent sits on the stage, and how much it is scaled on screen
// (the stage's scale, times a phone screen's own), measured whenever `from`
// changes. Only opening and closing animate. A new `from` while the state
// holds (the first measure, a re-measure) is applied at once: animating it
// would sweep the clip in from wherever the unmeasured rect put it, the
// stage's top left.
function expanding(el: HTMLElement) {
  let box = { w: 0, h: 0, x: 0, y: 0, k: 1, r: 0 }
  let measuredFor = ''
  let last = { open: el.hasAttribute('data-open'), key: '' }
  const measure = (fromKey: string) => {
    if (fromKey === measuredFor) return
    measuredFor = fromKey
    const p = el.parentElement
    const stage = p?.closest<HTMLElement>('.ss-stage')
    if (!p || !stage) return
    const sr = stage.getBoundingClientRect()
    const pr = p.getBoundingClientRect()
    const s = sr.width / stage.offsetWidth || 1
    const k = pr.width / p.offsetWidth || 1
    // Inside a Phone, open is the display's own corner, not square: the app
    // keeps its rounded corners all the way in and lands under the bezel's
    const r = parseFloat(getComputedStyle(p).getPropertyValue('--ss-screen-r')) || 0
    box = { w: p.clientWidth, h: p.clientHeight, x: (pr.left - sr.left) / s + (p.clientLeft * k) / s, y: (pr.top - sr.top) / s + (p.clientTop * k) / s, k: k / s, r }
  }
  // The styles for this render, written onto `target` (the live element or the next render)
  const styleFor = (target: HTMLElement) => {
    const open = target.hasAttribute('data-open')
    const [fx, fy, fw, fh] = (target.dataset.from ?? '0,0,0,0').split(',').map(Number)
    measure(target.dataset.from ?? '')
    const radius = Number(target.dataset.radius ?? 16)
    const ms = Number(target.dataset.ms ?? 520)
    const own = target.dataset.style ?? ''
    const key = `${open}|${fx}|${fy}|${fw}|${fh}|${box.w}|${box.h}|${box.x}|${box.y}`
    // Open, the target doesn't depend on `from`, so a re-measure mid-open (the
    // tapped notification easing back from its press) must not cut it short
    const moving = last.key === key || last.open !== open || open
    last = { open, key }
    const unmeasured = !open && (!fw || !fh || !box.w)
    // `from` in the parent's own pixels
    const x = (fx - box.x) / box.k
    const y = (fy - box.y) / box.k
    const w = fw / box.k
    const h = fh / box.k
    const r = Math.max(0, box.w - x - w)
    const b = Math.max(0, box.h - y - h)
    const content = target.querySelector<HTMLElement>(':scope > .ss-expand__content')
    const face = target.querySelector<HTMLElement>(':scope > .ss-expand__face')
    if (target.hasAttribute('data-launch')) {
      // A launch: a gentler, longer curve; with the card's the app is nearly
      // full screen within a tenth of a second, which reads as a jump. The app
      // at full size, scaled by the card's width onto the card, its height
      // clipped to the card's (in the window's own pixels)
      const curve = 'cubic-bezier(0.25, 0.6, 0.2, 1)'
      const s = box.w ? w / box.w : 1
      const clipH = Math.max(0, box.h - h / s)
      const shut = { transform: `translate(${x}px, ${y}px) scale(${s})`, clipPath: `inset(0px 0px ${clipH}px 0px round ${radius / s}px)` }
      const wide = { transform: 'translate(0px, 0px) scale(1)', clipPath: `inset(0px 0px 0px 0px round ${box.r}px)` }
      target.setAttribute('style', styleText({ ...(open ? wide : shut), '--ss-expand-ms': `${ms}ms`, '--ss-expand-ease': curve, ...(moving ? null : { transition: 'none' }), ...(unmeasured ? { visibility: 'hidden' } : null) }) + (own ? `;${own}` : ''))
      face?.setAttribute('style', styleText({ width: w, height: h, transform: `scale(${1 / s})` }))
      return
    }
    // A card: a quick start that settles long, like a UIKit spring with no overshoot
    const ease = `${ms}ms cubic-bezier(0.3, 0.75, 0.1, 1)`
    const clip = open ? `inset(0px 0px 0px 0px round ${box.r}px)` : `inset(${y}px ${r}px ${b}px ${x}px round ${radius}px)`
    target.setAttribute('style', styleText({ clipPath: clip, transition: moving ? `clip-path ${ease}` : 'none', visibility: unmeasured ? 'hidden' : undefined }) + (own ? `;${own}` : ''))
    // Retain the same composited content layer at both ends, so the text does
    // not re-rasterise when the card finishes opening or closing.
    content?.setAttribute('style', styleText({ transform: `translate3d(0, ${open ? 0 : y}px, 0)`, transition: moving ? `transform ${ease}` : 'none' }))
  }
  let first = true
  return {
    morph(next: Element) {
      styleFor(next as HTMLElement)
    },
    update() {
      if (!first) return
      first = false
      // Measured now that it is on the page; placed at once
      last.key = ''
      styleFor(el)
      last.key = ''
      styleFor(el)
    },
  }
}
