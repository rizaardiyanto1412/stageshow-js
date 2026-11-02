import type { Attrs, Child } from '../jsx-runtime'
import type { Rect } from '../measure'
import { behavior, hold, reduced as reducedMotion, stillAt } from '../render'
import './Follow.css'

export interface FollowProps extends Attrs {
  /** The rect to sit on, in stage pixels. null hides it. */
  to: Rect | null
  /** Higher is snappier. 0.25 is a quick, settled follow. */
  stiffness?: number
  children?: Child
}

/**
 * An overlay that springs onto a rect and keeps its momentum when the rect
 * changes: drop targets, selection rings, hover highlights. A CSS transition
 * restarts from rest on every change, so a target updated cell by cell on a
 * freeform drag stutters and shakes; this retargets smoothly instead.
 */
export function Follow({ to, stiffness = 0.25, className, style, children, ...rest }: FollowProps) {
  behavior('follow', following)
  return (
    <div
      {...rest}
      className={`ss-follow${className ? ` ${className}` : ''}`}
      data-ss-part="follow"
      data-show={to ? true : undefined}
      data-to={to ? `${to.x},${to.y},${to.width},${to.height}` : undefined}
      data-stiffness={stiffness}
      // The first frame, before the spring takes over: on its target
      style={{ ...style, ...(to ? { transform: `translate(${to.x}px, ${to.y}px)`, width: to.width, height: to.height } : null), ...(reducedMotion() ? { transition: 'none' } : null) }}
    >
      {children}
    </div>
  )
}

const KEYS = ['x', 'y', 'width', 'height'] as const
const targetOf = (el: Element): Rect | null => {
  const t = el.getAttribute('data-to')
  if (!t) return null
  const [x, y, width, height] = t.split(',').map(Number)
  return { x, y, width, height }
}

// A spring toward the target, retargeted from where it is and how fast it is
// moving whenever the target changes. The loop sleeps once it has settled; a
// new target wakes it.
function following(node: HTMLElement) {
  let target = targetOf(node)
  let cur: Rect | null = null
  let vel = { x: 0, y: 0, width: 0, height: 0 }
  let id = 0
  let running = false
  const k = Number(node.dataset.stiffness ?? 0.25)
  const damp = 2 * Math.sqrt(k) * 0.95
  const frame = 1000 / 60
  let previous = performance.now()
  let remainder = 0
  let simulation: Rect | null = null
  let velocity = { ...vel }
  let priorTarget: Rect | null = null
  const integrate = (c: Rect, v: typeof velocity, t: Rect) => {
    for (const key of KEYS) {
      v[key] += (t[key] - c[key]) * k - v[key] * damp
      c[key] += v[key]
    }
  }
  const draw = (c: Rect) => {
    hold(node, 'transform', `translate(${c.x}px, ${c.y}px)`)
    hold(node, 'width', `${c.width}px`)
    hold(node, 'height', `${c.height}px`)
  }
  const step = (time = performance.now()) => {
    const elapsed = Math.min(100, Math.max(0, time - previous))
    previous = time
    const t = target
    // Hidden: forget where it was, so it next appears on its target rather than sliding in from the last one
    if (!t || stillAt(node)) {
      cur = t ? { ...t } : null
      vel = { x: 0, y: 0, width: 0, height: 0 }
      simulation = cur ? { ...cur } : null
      velocity = { ...vel }
      remainder = 0
    }
    if (t) {
      if (!cur) cur = { ...t }
      if (!simulation || !priorTarget || KEYS.some((key) => priorTarget![key] !== t[key])) {
        // Retarget from the last drawn position and velocity, including
        // a partial simulation step, so an interruption cannot rewind.
        simulation = { ...cur }
        velocity = { ...vel }
        remainder = 0
      }
      priorTarget = { ...t }
      const c = cur
      const v = vel
      // Preserve the existing 60Hz spring trajectory. Interpolate its next
      // step at higher refresh rates instead of integrating faster per frame.
      remainder += elapsed
      while (remainder >= frame - 1e-6) {
        integrate(simulation, velocity, t)
        remainder = Math.max(0, remainder - frame)
      }
      const next = { ...simulation }
      const nextVelocity = { ...velocity }
      integrate(next, nextVelocity, t)
      const part = remainder / frame
      for (const key of KEYS) {
        c[key] = simulation[key] + (next[key] - simulation[key]) * part
        v[key] = velocity[key] + (nextVelocity[key] - velocity[key]) * part
        if (Math.abs(t[key] - c[key]) < 0.05 && Math.abs(v[key]) < 0.05) {
          c[key] = t[key]
          v[key] = 0
        }
      }
      draw(c)
    }
    const c = cur
    const v = vel
    const settled = !t || (c !== null && v.x === 0 && v.y === 0 && v.width === 0 && v.height === 0 && c.x === t.x && c.y === t.y && c.width === t.width && c.height === t.height)
    running = !settled
    if (running) id = requestAnimationFrame(step)
  }
  const wake = () => {
    if (stillAt(node) || !target || !cur) {
      // Initial placement and reappearance are layout, not spring motion.
      cancelAnimationFrame(id)
      running = false
      step()
      return
    }
    if (running || KEYS.every((key) => cur![key] === target![key] && vel[key] === 0)) return
    running = true
    previous = performance.now()
    id = requestAnimationFrame(step)
  }
  return {
    morph(next: Element) {
      target = targetOf(next)
    },
    update: wake,
    destroy() {
      running = false
      cancelAnimationFrame(id)
    },
  }
}

/**
 * Which cell a value falls in, sticky at the borders: it only changes once
 * the value is `hysteresis` of a cell past the edge, so a drag along a border
 * doesn't flicker between two cells.
 */
export function cellOf(value: number, size: number, prev: number | null, hysteresis = 0.2) {
  const raw = Math.floor(value / size)
  if (prev === null || raw === prev) return raw
  const edge = raw > prev ? (prev + 1) * size : prev * size
  return Math.abs(value - edge) > size * hysteresis ? raw : prev
}
