import type { Fidelity, Layout, Palette, Theme } from './looks'

// Rendering a scene: what a component can read while it renders (the look,
// whether the stage is still, ids), patching the live DOM to a new render,
// and the state the runtime keeps on elements between renders.

export type Look = { theme: Theme; palette: Palette; fidelity: Fidelity; layout: Layout }

const DEFAULT_LOOK: Look = { theme: 'light', palette: 'accent', fidelity: 'standard', layout: 'wide' }

// Rendering is synchronous, so what the stage being rendered sets here is
// what every component inside it reads
const context = { look: DEFAULT_LOOK, still: false, ids: 0, scope: 's' }

/** Render `fn` as the stage with this look, stillness and id scope. */
export function within<T>(look: Look, still: boolean, scope: string, fn: () => T): T {
  const was = { ...context }
  context.look = look
  context.still = still
  context.ids = 0
  context.scope = scope
  try {
    return fn()
  } finally {
    Object.assign(context, was)
  }
}

/** The stage's theme, palette, fidelity and layout, for a component rendering inside it. */
export const look = (): Look => context.look

/** Whether motion should settle at once: the stage shows its still, or the viewer asked for reduced motion. */
export const reduced = (): boolean => context.still

/** An id unique within the stage and the same on every render, for SVG gradients, masks and clips. Call it in the same order each render. */
export const uid = (): string => `${context.scope}-${++context.ids}`

// State the runtime writes onto scene elements (hover, press, scroll marks,
// a part's own inline styles) that a re-render must keep: the new markup
// doesn't know about it, and would otherwise strip it
type Kept = { attrs: Map<string, string>; styles: Map<string, string> }
const kept = new WeakMap<Element, Kept>()
const keptOf = (el: Element) => {
  let k = kept.get(el)
  if (!k) kept.set(el, (k = { attrs: new Map(), styles: new Map() }))
  return k
}

/** Set (or with null, remove) an attribute the runtime owns, so re-renders keep it. */
export function mark(el: Element | null | undefined, name: string, value: string | null | boolean = '') {
  if (!el) return
  if (value === null || value === false) {
    el.removeAttribute(name)
    kept.get(el)?.attrs.delete(name)
    return
  }
  const v = value === true ? '' : value
  el.setAttribute(name, v)
  keptOf(el).attrs.set(name, v)
}

/** Set (or with null, remove) an inline style property the runtime owns, so re-renders keep it. */
export function hold(el: HTMLElement | SVGElement | null | undefined, property: string, value: string | null) {
  if (!el) return
  if (value === null) {
    el.style.removeProperty(property)
    kept.get(el)?.styles.delete(property)
    return
  }
  el.style.setProperty(property, value)
  keptOf(el).styles.set(property, value)
}

/**
 * A part's behavior on the live page: the frames a render alone can't
 * describe (a number rolling from its old value, a spring, a measured
 * width). A part's markup names it with data-ss-part; the stage attaches one
 * behavior per element after each render, and drops it when the element goes.
 */
export interface Behavior {
  /** Before a render is applied to the element. Change `next` to keep what the behavior owns; return false to keep the children as they are. */
  morph?(next: Element): boolean | void
  /** After every render the element is in, and once when it first appears. */
  update?(): void
  /** The element left the scene, or the stage stopped. */
  destroy?(): void
}
export type BehaviorFactory = (el: HTMLElement) => Behavior

const factories = new Map<string, BehaviorFactory>()
const live = new WeakMap<Element, Behavior>()

/** Register a part's behavior under its data-ss-part name. Components call it as they render, so a bundle carries only the behaviors its scene uses. */
export function behavior(name: string, factory: BehaviorFactory) {
  if (!factories.has(name)) factories.set(name, factory)
}

/** Attach, update and drop behaviors for the parts now in `root`. `attached` is the stage's own set, carried between calls. */
export function syncBehaviors(root: Element, attached: Set<Element>, skip?: (el: Element) => boolean) {
  const now = new Set<Element>()
  // Innermost first, as effects run: a part settles its own size before the
  // part around it measures (a bubble before the thread that glides it)
  Array.from(root.querySelectorAll<HTMLElement>('[data-ss-part]')).reverse().forEach((el) => {
    if (skip?.(el)) return
    now.add(el)
    let b = live.get(el)
    if (!b) {
      const make = factories.get(el.dataset.ssPart!)
      if (!make) return
      live.set(el, (b = make(el)))
    }
    b.update?.()
  })
  for (const el of attached) if (!now.has(el)) dropBehavior(el)
  attached.clear()
  for (const el of now) attached.add(el)
}

/** The behavior attached to an element, if any. */
export const behaviorOf = (el: Element): Behavior | undefined => live.get(el)

/** Attach a behavior to an element directly, without a data-ss-part name: a live stage takes its element's renders this way. */
export function attach(el: Element, b: Behavior) {
  live.set(el, b)
}

export function dropBehavior(el: Element) {
  live.get(el)?.destroy?.()
  live.delete(el)
}

const KEY = 'data-ss-key'
const keyOf = (n: Node) => (n.nodeType === 1 ? (n as Element).getAttribute(KEY) : null)
// Nodes a behavior adds on its own (a fading copy, a ripple) aren't in any render: leave them
const owned = (n: Node) => n.nodeType === 1 && (n as Element).hasAttribute('data-ss-own')

/**
 * Patch the children of `target` (or the run of them between `after` and
 * `before`) to match `markup`, keeping each node where it can, so its
 * transitions run. Children match as React matches them: by key among
 * siblings only, and otherwise by position and tag. An empty slot ({cond &&
 * <x />}) renders as an empty comment, so the siblings after it keep their
 * places when it fills.
 */
export function patch(target: Element, markup: string, after: Node | null = null, before: Node | null = null) {
  const next = target.cloneNode(false) as Element
  next.innerHTML = markup
  const from: Node[] = []
  for (let n = after ? after.nextSibling : target.firstChild; n && n !== before; n = n.nextSibling) from.push(n)
  children(target, from, Array.from(next.childNodes), before)
}

// Match, update and place one parent's children
function children(parent: Node, from: Node[], to: Node[], end: Node | null) {
  const keyed = new Map<string, Node>()
  const loose: Node[] = []
  for (const n of from) {
    if (owned(n)) continue
    const k = keyOf(n)
    if (k !== null) keyed.set(k, n)
    else loose.push(n)
  }
  const used = new Set<Node>()
  let at = 0
  const placed = to.map((t) => {
    const k = keyOf(t)
    // Unkeyed: the same position among this parent's unkeyed children
    const match = k !== null ? keyed.get(k) : loose[at++]
    if (!match || used.has(match) || !same(match, t)) return t
    used.add(match)
    update(match, t)
    return match
  })
  // What this render drops goes first, so it never stands between two nodes
  // that stay and forces one of them to move
  for (const n of from) if (!used.has(n) && !owned(n) && n.parentNode === parent) parent.removeChild(n)
  // In order, moving only what is out of place: a node taken out and put
  // back would restart its transitions
  const start = from.find((n) => n.parentNode === parent) ?? null
  let ref = firstLive(start, end, parent)
  for (const node of placed) {
    if (node === ref) ref = firstLive(node.nextSibling, end, parent)
    else parent.insertBefore(node, ref)
  }
}

// The next node at or after `n` (before `end`) that a render owns
function firstLive(n: Node | null, end: Node | null, parent: Node): Node | null {
  while (n && n !== end && owned(n)) n = n.nextSibling
  return n && n !== end && n.parentNode === parent ? n : end
}

const same = (a: Node, b: Node) => a.nodeType === b.nodeType && (a.nodeType !== 1 || ((a as Element).tagName === (b as Element).tagName && (a as Element).namespaceURI === (b as Element).namespaceURI))

function update(from: Node, to: Node) {
  if (from.nodeType !== 1) {
    if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue
    return
  }
  const el = from as Element
  const next = to as Element
  if (!kept.has(el) && !live.has(el) && el.isEqualNode(next)) return
  // The behavior sees the render first, then what the runtime keeps is laid over it
  const keepChildren = live.get(el)?.morph?.(next) === false
  const k = kept.get(el)
  if (k) {
    for (const [name, value] of k.attrs) next.setAttribute(name, value)
    if (k.styles.size) {
      const style = (next as HTMLElement).style
      for (const [property, value] of k.styles) style.setProperty(property, value)
    }
  }
  syncAttributes(el, next)
  if (!keepChildren) children(el, Array.from(el.childNodes), Array.from(next.childNodes), null)
}

function syncAttributes(from: Element, to: Element) {
  for (const a of Array.from(to.attributes)) {
    if (from.getAttribute(a.name) === a.value) continue
    if (a.namespaceURI) from.setAttributeNS(a.namespaceURI, a.name, a.value)
    else from.setAttribute(a.name, a.value)
  }
  for (const a of Array.from(from.attributes)) if (!to.hasAttribute(a.name)) from.removeAttribute(a.name)
}

/** Whether a behavior should settle at once: its stage shows a still, or the viewer asked for reduced motion. */
export const stillAt = (el: Element) => !!el.closest('.ss-stage[data-still]') || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)
