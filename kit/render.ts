import morphdom from 'morphdom'
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
export function syncBehaviors(root: Element, attached: Set<Element>) {
  const now = new Set<Element>()
  root.querySelectorAll<HTMLElement>('[data-ss-part]').forEach((el) => {
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

export function dropBehavior(el: Element) {
  live.get(el)?.destroy?.()
  live.delete(el)
}

const KEY = 'data-ss-key'

/** Patch `target`'s children to match `markup`, keeping element identity where it can, so transitions run. */
export function patch(target: Element, markup: string) {
  const next = target.cloneNode(false) as Element
  next.innerHTML = markup
  morphdom(target, next, {
    childrenOnly: true,
    getNodeKey: (node) => (node instanceof Element ? (node.getAttribute(KEY) ?? (node.id || undefined)) : undefined),
    onBeforeElUpdated(from, to) {
      if (from.isEqualNode(to) && !kept.has(from)) return false
      const k = kept.get(from)
      if (k) {
        for (const [name, value] of k.attrs) to.setAttribute(name, value)
        if (k.styles.size) {
          const style = (to as HTMLElement).style
          for (const [property, value] of k.styles) style.setProperty(property, value)
        }
      }
      if (live.get(from)?.morph?.(to) === false) {
        syncAttributes(from, to)
        return false
      }
      return true
    },
        // Nodes a behavior adds on its own (a fading copy, a ripple) aren't in any render: leave them
    onBeforeNodeDiscarded: (node) => !(node instanceof Element && node.hasAttribute('data-ss-own')),
  })
}

// Attributes for an element that patches its own children, which morphdom
// then skips entirely
function syncAttributes(from: Element, to: Element) {
  for (const { name, value } of Array.from(to.attributes)) if (from.getAttribute(name) !== value) from.setAttribute(name, value)
  for (const { name } of Array.from(from.attributes)) if (!to.hasAttribute(name)) from.removeAttribute(name)
}

/** Whether a behavior should settle at once: its stage shows a still, or the viewer asked for reduced motion. */
export const stillAt = (el: Element) => !!el.closest('.ss-stage[data-still]') || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)
