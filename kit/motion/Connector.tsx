import type { Child } from '../jsx-runtime'
import { behavior, hold, mark, uid } from '../render'
import type { Point } from '../measure'
import './Connector.css'

type Route = 'h' | 'v' | 'straight' | 'step' | 'curve'

export interface ConnectorProps {
  from: Point
  to: Point
  /** h: across, then down or up. v: down or up, then across. straight: a direct line.
   * step: across, down or up halfway, then across again, so it enters `to`
   * level. Use step when several lines meet one target: they merge into one
   * shared run before it, instead of knotting at its edge. curve: the same
   * leave-level, arrive-level path as step, as one soft S, for a looser
   * diagram (a flow between nodes, a hand-off between two cards). */
  route?: Route
  /** Draws on when it turns true, fades off (intact) when it turns false. */
  show: boolean
  /** Corner radius at the elbow. */
  radius?: number
  /** End dots. Defaults to 'end', or 'none' with an arrow. */
  dots?: 'end' | 'both' | 'none'
  /** An arrowhead at `to`, for direction: a request going out, a response coming back. */
  arrow?: boolean
  /** A label on the line: a short word ("POST", "200 OK") in a pill, or a number for a step marker. Arrives after the line draws. */
  label?: Child
  /** Where along the line the label sits, 0 (from) to 1 (to). */
  labelAt?: number
  dashed?: boolean
  className?: string
}

/**
 * A line that ties one thing to another: an invoice to its plan, a row to its
 * detail card, a value to its annotation, a request to its endpoint. Points
 * are in stage pixels (from rect() or center()). Put it last in the scene so
 * it draws over both ends.
 */
export function Connector({ from, to, route = 'h', show, radius = 8, dots, arrow, label, labelAt = 0.5, dashed, className }: ConnectorProps) {
  // A curve with an arrow ends a little short and runs straight in, so the
  // head sits on a straight run. Over a short gap the curve only levels out in
  // its last pixels, and a head laid on the bend kinks against the line
  const tip = arrow && route === 'curve' ? { x: to.x - Math.sign(to.x - from.x) * Math.min(8, Math.abs(to.x - from.x) / 3), y: to.y } : to
  const d = tip === to ? elbow(from, to, route, radius) : `${elbow(from, tip, route, radius)}L${to.x} ${to.y}`
  const ends = dots ?? (arrow ? 'none' : 'end')
  behavior('connector', connecting)
  const revealId = `ss-connector-${uid()}`
  const pts = tip === to ? corners(from, to, route) : [...corners(from, tip, route), to]
  const q = pts[pts.length - 1]
  // A straight horizontal/vertical elbow can end with a zero-length leg.
  // Its arrow follows the last real segment, rather than collapsing to a dot.
  const p = pts.slice(0, -1).reverse().find(p => Math.hypot(q.x - p.x, q.y - p.y) > .001) ?? q
  const directionLength = Math.hypot(q.x - p.x, q.y - p.y)
  const len = directionLength || 1
  const ux = (q.x - p.x) / len
  const uy = (q.y - p.y) / len
  const head = `M${q.x - ux * 6 - uy * 4} ${q.y - uy * 6 + ux * 4}L${q.x} ${q.y}L${q.x - ux * 6 + uy * 4} ${q.y - uy * 6 - ux * 4}`
  const at = along(pts, labelAt)
  return (
    <>
      <svg className={`ss-connector${className ? ` ${className}` : ''}`} data-ss-part="connector" data-show={show || undefined} data-dashed={dashed || undefined} aria-hidden>
        {/* The reveal has its own normalized path. The visible dashed line
            keeps real dash spacing while its tip travels toward the target. */}
        {dashed && <defs><mask id={revealId} maskUnits="userSpaceOnUse"><path className="ss-connector__reveal" d={d} pathLength="1" style={{ fill: 'none', stroke: '#fff', strokeWidth: 8 }} /></mask></defs>}
        <path className="ss-connector__line" d={d} pathLength={dashed ? undefined : 1} mask={dashed ? `url(#${revealId})` : undefined} />
        {arrow && directionLength > .001 && <path d={head} className="ss-connector__arrow" />}
        {ends === 'both' && <circle cx={from.x} cy={from.y} r={3} className="ss-connector__dot ss-connector__dot--start" />}
        {ends !== 'none' && <circle cx={to.x} cy={to.y} r={3} className="ss-connector__dot" />}
      </svg>
      {label !== undefined && (
        <span className="ss-connector__label" data-show={show || undefined} data-step={typeof label === 'number' || undefined} style={{ left: at.x, top: at.y }}>
          {label}
        </span>
      )}
    </>
  )
}

// The S-curve's controls: level out of `a` and level into `b`, half way across
function bend(a: Point, b: Point): [Point, Point] {
  const m = (a.x + b.x) / 2
  return [{ x: m, y: a.y }, { x: m, y: b.y }]
}

function corners(a: Point, b: Point, route: Route): Point[] {
  if (route === 'straight') return [a, b]
  if (route === 'curve') {
    // Sampled, so a label and the arrow follow the curve itself
    const [c1, c2] = bend(a, b)
    return Array.from({ length: 25 }, (_, i) => {
      const t = i / 24
      const u = 1 - t
      return {
        x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
        y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
      }
    })
  }
  if (route === 'step') {
    const m = (a.x + b.x) / 2
    return [a, { x: m, y: a.y }, { x: m, y: b.y }, b]
  }
  return route === 'h' ? [a, { x: b.x, y: a.y }, b] : [a, { x: a.x, y: b.y }, b]
}

function along(pts: Point[], f: number): Point {
  const segs = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y))
  let left = segs.reduce((n, s) => n + s, 0) * Math.max(0, Math.min(1, f))
  for (let i = 0; i < segs.length; i++) {
    if (left <= segs[i] || i === segs.length - 1) {
      const t = segs[i] ? Math.min(1, left / segs[i]) : 0
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t }
    }
    left -= segs[i]
  }
  return pts[0]
}

function elbow(a: Point, b: Point, route: Route, r: number) {
  if (route === 'straight') return `M${a.x} ${a.y}L${b.x} ${b.y}`
  if (route === 'curve') {
    const [c1, c2] = bend(a, b)
    return `M${a.x} ${a.y}C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`
  }
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (route === 'step') {
    const m = (a.x + b.x) / 2
    const k = Math.min(r, Math.abs(dx) / 2, Math.abs(dy) / 2)
    const sx = Math.sign(dx) || 1
    const sy = Math.sign(dy) || 1
    if (!k) return `M${a.x} ${a.y}H${m}V${b.y}H${b.x}`
    return `M${a.x} ${a.y}H${m - sx * k}Q${m} ${a.y} ${m} ${a.y + sy * k}V${b.y - sy * k}Q${m} ${b.y} ${m + sx * k} ${b.y}H${b.x}`
  }
  const k = Math.min(r, Math.abs(dx), Math.abs(dy))
  const sx = Math.sign(dx) || 1
  const sy = Math.sign(dy) || 1
  if (route === 'h') {
    return `M${a.x} ${a.y}H${b.x - sx * k}Q${b.x} ${a.y} ${b.x} ${a.y + sy * k}V${b.y}`
  }
  return `M${a.x} ${a.y}V${b.y - sy * k}Q${a.x} ${b.y} ${a.x + sx * k} ${b.y}H${b.x}`
}

// Once the line has drawn all the way, it and its label are marked arrived
// (the label waits for it). The endpoint belongs to the visible line, not a
// guessed delay, so this also works when reduced motion removes the
// transition, or a host advances its CSS transition one frame at a time. A
// dashed line ends on a dash, never a gap short of its target: the 4/4
// pattern is stretched a hair so a whole number of dashes fits.
function connecting(svg: HTMLElement) {
  let arrived = false
  let key = ''
  const label = () => {
    const next = svg.nextElementSibling
    return next?.classList.contains('ss-connector__label') ? next : null
  }
  const set = (v: boolean) => {
    arrived = v
    mark(svg, 'data-arrived', v && 'true')
    mark(label(), 'data-arrived', v && 'true')
  }
  const drawn = () => (svg.hasAttribute('data-dashed') ? svg.querySelector<SVGPathElement>('.ss-connector__reveal') : svg.querySelector<SVGPathElement>('.ss-connector__line'))
  const check = () => {
    const el = drawn()
    if (el && svg.hasAttribute('data-show') && Math.abs(parseFloat(getComputedStyle(el).strokeDashoffset)) < 0.0001) set(true)
  }
  const settle = (event: Event) => {
    if (event.target === drawn() && (event as TransitionEvent).propertyName === 'stroke-dashoffset') check()
  }
  svg.addEventListener('transitionend', settle)
  svg.addEventListener('transitioncancel', settle)
  return {
    update() {
      const line = svg.querySelector<SVGPathElement>('.ss-connector__line')
      const now = `${line?.getAttribute('d')}|${svg.hasAttribute('data-show')}|${svg.hasAttribute('data-dashed')}`
      // A label that appeared after the line arrived
      if (arrived) mark(label(), 'data-arrived', 'true')
      if (now === key) return
      key = now
      if (line) {
        if (!svg.hasAttribute('data-dashed')) hold(line, 'stroke-dasharray', null)
        else {
          const len = line.getTotalLength()
          const n = Math.max(1, Math.round((len + 4) / 8))
          const dash = (len / (n * 2 - 1)).toFixed(3)
          hold(line, 'stroke-dasharray', `${dash} ${dash}`)
        }
      }
      set(false)
      check()
    },
    destroy() {
      svg.removeEventListener('transitionend', settle)
      svg.removeEventListener('transitioncancel', settle)
    },
  }
}
