import './stage.css'
import { checkSeam, createAct, Stopped, type Script, type StageHandle } from './act'
import { Cursor, ripple as spawnRipple, type CursorKind, type CursorStyle } from './cursor'
import { Html, html, styleText, type Child, type Style } from './jsx-runtime'
import { Keycaps, type Keys, type KeysAt } from './keys'
import type { Fidelity, Layout, Palette, Theme } from './looks'
import { EMPTY, nameOf, rectOf, sameRects, stageSpace, targetRectOf, thumb, type Point, type Rect, type Target } from './measure'
import { dropBehavior, hold, mark, patch, syncBehaviors, within, type Look } from './render'
import { clock } from './clock'
import { clamp, easeInOutCubic, isDev, warn } from './util'

// The stage: fits a design-size scene into its container, runs the script
// while it is on screen, and draws the cursor and keycaps over the scene.
// Stage() renders the markup, as any component does; mount() (mount.ts)
// brings each stage on the page to life with a StageRun, which holds the
// scene state and re-renders the scene when it changes. The script API is
// act.ts, the cursor cursor.tsx, measuring measure.ts.

/** loop: repeats while on screen. once: plays when first seen, then holds the end. hover: plays while the pointer is over it, settles back when it leaves; on a screen with no hover (a phone) it plays once. */
export type Play = 'loop' | 'once' | 'hover'

/** Design tokens for a look: `--ss-accent`, `--ss-radius-md`, `--ss-font` and the rest. */
export type LookTokens = { [token: `--ss-${string}`]: string }

export interface StageProps<S> {
  /** Design size. The stage scales down to fit its container, and only grows past it with `fill`. */
  width: number
  height: number
  /** Scene state at the start of each loop. Statics can leave it out. */
  initial?: S
  /** Loops while on screen. Leave out for a static illustration. */
  script?: Script<S>
  /** The still frame shown under reduced motion or with no script. Defaults to initial. */
  poster?: S
  /**
   * Where the cursor rests at the start of each loop, or where it sits in a
   * still. Leave out to hide it. Animated demos hide it in their reduced-motion
   * poster unless `still` is true. `ripple` sends a soft ring out from each
   * click, for demos where clicks need to read at a glance (small stages, the
   * arrow and circle styles). `idle` is how long (ms) the cursor may rest
   * after it has acted before it fades out (4000 by default); it fades back
   * in as it next moves, and never fades while it presses or hovers. Before
   * its first move each loop it waits out of shot instead, coming back just
   * before it moves. false keeps it on screen throughout. `at` can differ by
   * layout: { wide: ..., compact: ... }, for a stage with a compact design.
   */
  cursor?: { at: Target | { wide: Target; compact: Target }; kind?: CursorKind; style?: CursorStyle; still?: boolean; ripple?: boolean; idle?: number | false }
  play?: Play
  /**
   * A second, smaller design for narrow containers. Below `below` px of
   * container width the stage uses this size, the render's `layout` argument
   * (and `look().layout` inside the stage) and data-layout become 'compact', and the script restarts. Build the
   * compact scene as a tighter crop around the story, never the wide scene
   * shrunk.
   */
  compact?: { below: number; width: number; height: number }
  /** Where keycaps from act.key appear. */
  keys?: KeysAt | { wide: KeysAt; compact: KeysAt }
  /** Targets shown hovered in a still, since no script is there to hover them. */
  hover?: string[]
  theme?: Theme
  palette?: Palette
  fidelity?: Fidelity
  /** The grays' temperature. `warm` (the default) is a warm canvas and well;
   * `cool` swaps them for cool ones, for a macOS scene or a blue ground, so
   * every gray shares one temperature. Light theme only. */
  greys?: 'warm' | 'cool'
  /** A look as values: any `--ss-*` tokens (color, type, shape, density),
   * set on the stage over its theme's. See `references/looks.md`. */
  tokens?: LookTokens
  /** Grow past the design size to fill the container (up to 2x), for a hero or a docs plate. A host page can set data-ss-fill on any wrapper instead. */
  fill?: boolean
  /** The accent color for this stage (any CSS color). Sets --ss-accent, its soft fill and the gradient's second stop together. */
  accent?: string
  /** What the scene sits on. `orbs`: a pale tile lit by a few huge, soft
   * color orbs behind the UI, so glass has color to take and white cards
   * lift off it. Pass two or three colors to choose them (lavender and
   * orange by default). Leave it out for the plain ground. */
  ground?: 'orbs' | [string, string] | [string, string, string]
  /** Plays the script faster (above 1) or slower (below 1). Waits and tweens divide by it. */
  speed?: number
  className?: string
  /** A specimen sheet of parts (the kit's chrome, controls, phones sheets), not a product frame: film's composition checks (framing, ladders, voids) stand down. */
  specimen?: boolean
  /** No framing, when the developer asks for it: no ground, and the product sits whole with room around it, floating on their page. Film's bleed and floating checks stand down; everything else still applies. */
  unframed?: boolean
  /** The scene, as a function of its state. `rect` reads where a data-target is (in stage pixels, empty until measured); `layout` is 'wide' or 'compact' (see `compact`). */
  children: (s: S, rect: (name: string) => Rect, layout: Layout) => Child
}

// Stages rendered by the scene render in progress, in order. mount() renders
// the scene the same way the markup was made, so the n-th stage it collects
// is the n-th [data-ss-stage] in the page.
let collecting: StageProps<object>[] | null = null

/** Render a scene and collect the stages in it, for mount(). */
export function collect(scene: () => Child): { markup: string; stages: StageProps<object>[] } {
  const was = collecting
  const stages: StageProps<object>[] = (collecting = [])
  try {
    return { markup: html(scene()), stages }
  } finally {
    collecting = was
  }
}

const NONE = {}

// What a host tool can set on window.__stageshow before stages mount:
// film.mjs slows every stage down (--slow) or films it dark (--dark), and
// the playground shows every stage's still (Reduced motion)
type Film = { slow?: number; theme?: Theme; still?: boolean }
const film = (): Film => (typeof window === 'undefined' ? {} : ((window as unknown as { __stageshow?: Film }).__stageshow ?? {}))

/** The stage markup with no motion running: the first frame a server or an export writes, before mount() takes over. */
export function Stage<S extends object>(props: StageProps<S>): Html {
  const base = props as unknown as StageProps<object>
  const index = collecting ? collecting.push(base) - 1 : -1
  const { width, height, initial = NONE as S, poster, script, className, fill } = props
  const still = !script
  const state = still && poster ? poster : initial
  const look = lookOf(base, 'wide')
  const scene = within(look, still, `ss${index}`, () => html(props.children(state, () => EMPTY, 'wide')))
  // Before the script runs, CSS alone fits the frame to its box: the box is a
  // size container, and tan(atan2(box, design)) is their ratio as a number
  const rootStyle = stageStyle(base, width, height, `min(1, tan(atan2(100cqw, ${width}px)))`, 0)
  return new Html(
    `<div class="ss-fit${className ? ` ${className}` : ''}" data-ss-stage="${index}" style="${styleText({ maxWidth: fill ? undefined : width, aspectRatio: `${width} / ${height}`, containerType: 'inline-size' })}">` +
      `<div class="ss-stage"${stageAttrs(base, look, still, true)} style="${rootStyle}">` +
      groundHtml(base) +
      scene +
      `<div class="ss-overlay"></div>` +
      `</div></div>`,
  )
}

const lookOf = (p: StageProps<object>, layout: Layout): Look => ({
  theme: film().theme ?? p.theme ?? 'light',
  palette: p.palette ?? 'accent',
  fidelity: p.fidelity ?? 'standard',
  layout,
})

function stageAttrs(p: StageProps<object>, look: Look, still: boolean, placing: boolean) {
  const a: [string, string | false | undefined][] = [
    ['data-specimen', p.specimen && 'true'],
    ['data-unframed', p.unframed && 'true'],
    ['data-still', still && 'true'],
    ['data-placing', placing && 'true'],
    ['data-theme', look.theme],
    ['data-palette', look.palette],
    ['data-greys', p.greys === 'cool' && 'cool'],
    ['data-fidelity', look.fidelity],
    ['data-layout', look.layout],
  ]
  return a.map(([k, v]) => (v ? ` ${k}="${v}"` : '')).join('')
}

function stageStyle(p: StageProps<object>, w: number, h: number, scale: number | string, inset: number) {
  const accent = p.accent
  return styleText({
    width: w,
    height: h,
    marginLeft: inset || undefined,
    transform: `scale(${scale})`,
    ...p.tokens,
    ...(accent ? { '--ss-accent': accent, '--ss-accent-2': accent, '--ss-accent-soft': `color-mix(in srgb, ${accent} 14%, transparent)` } : null),
  } as Style)
}

function groundHtml(p: StageProps<object>) {
  if (!p.ground) return ''
  const g = p.ground
  const style = Array.isArray(g) ? styleText({ '--ss-orb-1': g[0], '--ss-orb-2': g[1], '--ss-orb-3': g[2] }) : ''
  return `<div class="ss-ground" aria-hidden="true"${style ? ` style="${style}"` : ''}></div>`
}

/**
 * A live stage: fits it, renders its scene from state, and runs its script
 * while it is on screen. One per [data-ss-stage] element, made by mount().
 */
export class StageRun<S extends object> {
  readonly fit: HTMLDivElement
  readonly root: HTMLDivElement
  readonly overlay: HTMLDivElement
  private p: StageProps<S>
  private scope: string
  private layout: Layout = 'wide'
  private scale = 1
  private state: S
  private rects: Record<string, Rect> = {}
  private kind: CursorKind
  private keys: Keys = { id: 0, caps: [], show: false, down: false }
  private lastKeys: Keys | null = null
  private pos: Point = { x: 0, y: 0 }
  private hovered: Element | null = null
  private dragging = false
  private autoUsed = false
  private auto: ((p: Point) => void) | null = null
  private reducedQuery = typeof matchMedia === 'undefined' ? null : matchMedia('(prefers-reduced-motion: reduce)')
  private stopPlayback: (() => void) | null = null
  private cleanups: (() => void)[] = []
  // The scene's parts with a behavior attached (render.ts)
  private behaviors = new Set<Element>()
  private queued = false
  private settleFrame = 0
  private passes = { n: 0, frame: 0, owed: false }
  // When the cursor last did something, and per loop: when it began, whether
  // the cursor has moved yet, and (learned from the first run) how long it
  // waits before its first move
  private active = 0
  private loopAt = 0
  private moved = false
  private firstMove: number | null = null
  private glideId = 0
  private resetFrame = 0

  constructor(fit: HTMLDivElement, props: StageProps<S>, index: number) {
    this.fit = fit
    this.root = fit.querySelector<HTMLDivElement>(':scope > .ss-stage')!
    this.overlay = this.root.querySelector<HTMLDivElement>(':scope > .ss-overlay')!
    this.p = props
    this.scope = `ss${index}`
    this.kind = props.cursor?.kind ?? 'pointer'
    this.state = props.initial ?? (NONE as S)
    this.fit.style.removeProperty('aspect-ratio')
    this.fit.style.removeProperty('container-type')
    this.watchFit()
    this.watchMotion()
    const onSettled = () => this.remeasure()
    this.root.addEventListener('transitionend', onSettled)
    this.root.addEventListener('animationend', onSettled)
    this.cleanups.push(() => {
      this.root.removeEventListener('transitionend', onSettled)
      this.root.removeEventListener('animationend', onSettled)
    })
    this.begin()
  }

  get still() {
    return !this.p.script || !!this.reducedQuery?.matches || !!film().still
  }
  private get play(): Play {
    const play = this.p.play ?? 'loop'
    // Hover scripts can hold their ending without returning to the start.
    // On touch, play once rather than assuming the script has a loop seam.
    return play === 'hover' && matchMedia('(hover: none)').matches ? 'once' : play
  }
  private get speed() {
    return (this.p.speed ?? 1) / (film().slow ?? 1)
  }
  private get design() {
    const c = this.p.compact
    return this.layout === 'compact' && c ? { w: c.width, h: c.height } : { w: this.p.width, h: this.p.height }
  }
  // Where the cursor rests, for the layout showing
  private restAt(): Target {
    const at = this.p.cursor!.at
    return typeof at === 'object' && 'wide' in at ? at[this.layout] : at
  }

  /** Render the scene for the current state now. */
  render() {
    this.queued = false
    const look = lookOf(this.p as unknown as StageProps<object>, this.layout)
    const markup = within(look, this.still, this.scope, () => html(this.p.children(this.state, (name) => this.rects[name] ?? EMPTY, this.layout)))
    // The scene is the stage's children between the ground and the overlay
    patch(this.root, markup, this.root.querySelector(':scope > .ss-ground'), this.overlay)
    syncBehaviors(this.root, this.behaviors)
    this.renderOverlay()
    this.remeasure()
    // The cursor's kind follows what's under it after every change too, so
    // a hand doesn't linger when the link it was over slides away. Not
    // mid-drag: the drag owns the kind until release.
    if (this.p.cursor && !this.still && !this.dragging) this.auto?.(this.pos)
  }

  private renderOverlay() {
    const { cursor, script, keys } = this.p
    const at = typeof keys === 'object' ? keys[this.layout] : (keys ?? 'bottom')
    const showCursor = cursor && (!script || !this.still || cursor.still)
    let markup = script ? html(Keycaps({ rows: [this.lastKeys, this.keys], at })) : ''
    if (showCursor) markup += `<div data-ss-key="ss-cursor" style="display:contents">${html(Cursor({ style: cursor.style, kind: this.kind }))}</div>`
    patch(this.overlay, markup)
  }

  private get cursorEl() {
    return this.overlay.querySelector<HTMLDivElement>('.ss-cursor')
  }

  /** Merge a patch into state and render on the next microtask, with any other changes made meanwhile. */
  put(patch: Partial<S> | ((s: S) => Partial<S>)) {
    this.state = { ...this.state, ...(typeof patch === 'function' ? patch(this.state) : patch) }
    if (this.queued) return
    this.queued = true
    queueMicrotask(() => this.queued && this.render())
  }

  /** Render whatever is queued now, so the scene and the cursor paint in the same frame. */
  flush() {
    if (this.queued) this.render()
  }

  // Rects of every data-target, in stage pixels, refreshed after each render.
  private measureAll() {
    const out: Record<string, Rect> = {}
    const targets = this.root.querySelectorAll<HTMLElement>('[data-target]')
    if (!targets.length) return out
    const space = stageSpace(this.root, this.scale)
    targets.forEach((el) => {
      out[el.dataset.target!] = targetRectOf(this.root, el, this.scale, space)
    })
    return out
  }
  // Something placed from rect() can itself be a target, and the two can
  // chase each other. Allow a few passes per frame, then wait for the next.
  private remeasure = () => {
    const p = this.passes
    if (!p.frame)
      p.frame = clock.layoutRaf(() => {
        p.n = 0
        p.frame = 0
        if (!p.owed) return
        p.owed = false
        this.takeRects(this.measureAll())
      })
    if (p.n >= 4) {
      p.owed = true
      return
    }
    p.n++
    this.takeRects(this.measureAll())
  }
  private takeRects(next: Record<string, Rect>) {
    if (sameRects(this.rects, next)) return
    this.rects = next
    this.render()
  }

  // Fit: pick the layout from the container width, then scale its design
  // size into it.
  private fitNow = () => {}
  private watchFit() {
    const fit = this.fit
    const measure = (this.fitNow = () => {
      const { width, compact, fill } = this.p
      const w = fit.clientWidth
      // A host that sizes the stage by something other than the screen (a
      // bento tile set by its row's height) marks a wrapper data-ss-wide to
      // keep the wide design, scaled, rather than the phone-width one
      const wide = !!fit.parentElement?.closest('[data-ss-wide]')
      const next: Layout = compact && !wide && w < compact.below ? 'compact' : 'wide'
      // fill (or a host wrapper marked data-ss-fill) lets the stage grow past its design size, within reason
      const grow = !!fill || !!fit.parentElement?.closest('[data-ss-fill]')
      const dw = next === 'compact' ? compact!.width : width
      const s = Math.min(grow ? 2 : 1, w / dw || 1)
      this.scale = s
      // A design narrower than its box (a compact layout, or a stage that has
      // stopped at its design size) sits in the middle of it, not at its left
      const inset = Math.max(0, (w - dw * s) / 2)
      const switched = next !== this.layout
      this.layout = next
      const { w: dW, h: dH } = this.design
      fit.style.maxWidth = grow ? '' : `${width}px`
      fit.style.height = `${dH * s}px`
      this.root.setAttribute('style', stageStyle(this.p as unknown as StageProps<object>, dW, dH, s, inset))
      this.root.dataset.layout = next
      if (switched && this.started) this.begin()
      // A new size moves what rect() reports
      else if (this.started) this.remeasure()
    })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(fit)
    // Hosts can switch layout/fill policy without changing this box's
    // width. Observe only those attributes on its ancestors, not the scene.
    const hosts = new MutationObserver(measure)
    for (let host = fit.parentElement; host; host = host.parentElement) hosts.observe(host, { attributes: true, attributeFilter: ['data-ss-wide', 'data-ss-fill'] })
    this.cleanups.push(() => {
      ro.disconnect()
      hosts.disconnect()
    })
  }

  private watchMotion() {
    const q = this.reducedQuery
    if (!q) return
    const change = () => this.begin()
    q.addEventListener('change', change)
    this.cleanups.push(() => q.removeEventListener('change', change))
  }

  private started = false
  // A fresh scene: on mount, and whenever the layout or motion preference
  // changes. Places everything without transitions, then starts playback.
  private begin() {
    this.started = true
    this.stopPlayback?.()
    this.stopPlayback = null
    const look = lookOf(this.p as unknown as StageProps<object>, this.layout)
    const still = this.still
    for (const [k, v] of [['theme', look.theme], ['palette', look.palette], ['fidelity', look.fidelity], ['layout', look.layout]] as const) this.root.dataset[k] = v
    this.root.toggleAttribute('data-still', still)
    if (this.p.specimen) this.root.dataset.specimen = 'true'
    if (this.p.unframed) this.root.dataset.unframed = 'true'
    if (this.p.greys === 'cool') this.root.dataset.greys = 'cool'
    this.settle()
    this.reset()
    if (still || !this.p.script) {
      this.root.removeAttribute('data-offscreen')
      this.state = this.p.poster ?? this.p.initial ?? (NONE as S)
      this.render()
      this.markHover()
      if (this.p.cursor) this.placeAt(this.resolve(this.restAt()))
      return
    }
    this.render()
    if (this.p.cursor) this.placeAt(this.resolve(this.restAt()))
    this.stopPlayback = this.playback()
  }

  // Placing: until the first measurements (after fonts load) have painted,
  // and again after a wide/compact switch, nothing transitions. Otherwise
  // anything placed from rect() would visibly travel from 0,0 into place.
  private settle() {
    const root = this.root
    root.setAttribute('data-placing', 'true')
    clock.cancelLayoutRaf(this.settleFrame)
    const release = () => {
      this.settleFrame = clock.layoutRaf(() => {
        this.settleFrame = clock.layoutRaf(() => root.removeAttribute('data-placing'))
      })
    }
    if (!document.fonts || document.fonts.status === 'loaded') release()
    else void document.fonts.ready.then(release)
  }

  // Stills have no script to hover things, so mark them here.
  private markHover() {
    this.p.hover?.forEach((name) => mark(this.root.querySelector(`[data-target="${name}"]`), 'data-hover'))
  }

  private placeAt = (p: Point) => {
    if (this.loopAt && !this.moved && Math.hypot(p.x - this.pos.x, p.y - this.pos.y) > 0.5) {
      this.moved = true
      this.firstMove ??= performance.now() - this.loopAt
    }
    this.pos = p
    this.active = performance.now()
    const el = this.cursorEl
    if (!el) return
    hold(el, 'transform', `translate(${p.x}px, ${p.y}px)`)
    mark(el, 'data-idle', null)
  }

  private resolve = (t: Target): Point => {
    // One target per layout, as cursor.at takes it
    if (typeof t === 'object' && t !== null && 'wide' in t) t = this.layout === 'compact' ? t.compact : t.wide
    const name = nameOf(t)
    if (name === null) return t as Point
    const el = this.root.querySelector<HTMLElement>(`[data-target="${name}"]`)
    if (!el) {
      warn(`no element with data-target="${name}"`)
      return this.pos
    }
    const r = rectOf(this.root, el, this.scale)
    const f = typeof t === 'string' ? { x: 0.5, y: 0.5 } : (t as { x: number; y: number })
    return { x: r.x + r.width * f.x, y: r.y + r.height * f.y }
  }

  private cancelReset() {
    ++this.glideId
    cancelAnimationFrame(this.resetFrame)
    this.resetFrame = 0
    this.root.removeAttribute('data-settling')
  }

  // Back to the start. `glide` (a hover stage settling as the pointer leaves)
  // lets the scene's own transitions carry it back and walks the cursor home;
  // otherwise everything jumps, since nobody is watching.
  private reset(glide = false) {
    this.cancelReset()
    const id = this.glideId
    const root = this.root
    this.dragging = false
    this.state = this.p.initial ?? (NONE as S)
    this.kind = this.p.cursor?.kind ?? 'pointer'
    this.keys = { ...this.keys, show: false, down: false }
    this.lastKeys = null
    root.querySelectorAll('[data-hover],[data-pressed]').forEach((el) => {
      mark(el, 'data-hover', null)
      mark(el, 'data-pressed', null)
    })
    root.removeAttribute('data-mark')
    root.querySelectorAll<HTMLElement>('[data-scrolled]').forEach((el) => {
      el.scrollTop = 0
      mark(el, 'data-scrolled', null)
      thumb(el)
    })
    root.querySelectorAll('[data-scrolling]').forEach((el) => mark(el, 'data-scrolling', null))
    this.render()
    mark(this.cursorEl, 'data-pressed', null)
    this.hovered = null
    if (!this.p.cursor) return
    if (!glide) {
      this.resetFrame = requestAnimationFrame(() => {
        this.resetFrame = 0
        this.placeAt(this.resolve(this.restAt()))
        this.auto?.(this.pos)
      })
      return
    }
    root.setAttribute('data-settling', '')
    this.resetFrame = requestAnimationFrame(() => {
      const from = { ...this.pos }
      const end = this.resolve(this.restAt())
      const ms = clamp(320 + Math.hypot(end.x - from.x, end.y - from.y) * 0.7, 380, 700)
      const t0 = performance.now()
      const step = () => {
        if (this.glideId !== id) return
        const t = Math.min(1, (performance.now() - t0) / ms)
        const e = easeInOutCubic(t)
        this.placeAt({ x: from.x + (end.x - from.x) * e, y: from.y + (end.y - from.y) * e })
        if (t < 1) this.resetFrame = requestAnimationFrame(step)
        else {
          this.resetFrame = 0
          root.removeAttribute('data-settling')
        }
      }
      step()
    })
  }

  // What an act works with. Each run gets its own act (act.ts), bound to its
  // own signal, so a canceled run can never pick up the next run's signal
  // and keep going.
  private handle(): StageHandle<S> {
    const run = this
    return {
      root: this.root,
      get cursorEl() {
        return run.cursorEl
      },
      get pos() {
        return run.pos
      },
      get hovered() {
        return run.hovered
      },
      set hovered(el) {
        run.hovered = el
      },
      get kind() {
        return run.kind
      },
      get keys() {
        return run.keys
      },
      get dragging() {
        return run.dragging
      },
      set dragging(v) {
        run.dragging = v
      },
      get autoUsed() {
        return run.autoUsed
      },
      set autoUsed(v) {
        run.autoUsed = v
      },
      set auto(fn) {
        run.auto = fn
      },
      get auto() {
        return run.auto
      },
      get scale() {
        return run.scale
      },
      speed: this.speed,
      layout: this.layout,
      cursor: this.p.cursor,
      resolve: this.resolve,
      place: this.placeAt,
      remeasure: this.remeasure,
      ripple: (at) => {
        if (!this.still) spawnRipple(this.root, at)
      },
      put: (patch) => this.put(patch),
      flush: () => this.flush(),
      setKind: (k) => {
        if (k === this.kind) return
        this.kind = k
        this.renderOverlay()
      },
      setKeys: (keys, last) => {
        if (last !== undefined) this.lastKeys = last
        this.keys = keys
        this.renderOverlay()
      },
    }
  }

  // Run the loop only while the stage is on screen and the tab is visible.
  private playback() {
    const stage = this.root
    const fit = this.fit
    const { script, cursor } = this.p
    const play = this.play
    let ctrl: AbortController | null = null
    let onScreen = false
    let hovering = false
    let done = false

    // Idle: a cursor waiting to start reads as a stuck one, so before its
    // first move it steps out of the shot. Once it has acted, resting to
    // watch the result is part of the story: only a long stillness fades it,
    // and never while it holds a press or rests on what it hovers.
    const idle = cursor?.idle ?? 4000
    const LEAD = 1200
    let idleTimer = 0
    let revealTimer = 0
    const watchIdle = () => {
      window.clearInterval(idleTimer)
      if (!cursor || idle === false) return
      this.active = performance.now()
      idleTimer = window.setInterval(() => {
        const el = this.cursorEl
        if (!el) return
        const now = performance.now()
        if (!this.moved) {
          // Later loops know when it moves and handle it in beginLoop
          if (this.firstMove === null && now - this.active > LEAD) mark(el, 'data-idle')
          return
        }
        if (el.hasAttribute('data-pressed') || stage.querySelector('[data-hover]')) this.active = now
        else if (now - this.active > idle) mark(el, 'data-idle')
      }, 150)
    }
    const beginLoop = () => {
      this.loopAt = performance.now()
      this.moved = false
      window.clearTimeout(revealTimer)
      const el = this.cursorEl
      const wait = this.firstMove
      if (idle === false || !el || wait === null || wait <= LEAD) return
      // A long opening wait: out now, back in just before the first move
      mark(el, 'data-idle')
      revealTimer = window.setTimeout(() => mark(this.cursorEl, 'data-idle', null), wait - 400)
    }
    const unwatchIdle = () => {
      window.clearInterval(idleTimer)
      window.clearTimeout(revealTimer)
      this.loopAt = 0
      mark(this.cursorEl, 'data-idle', null)
    }
    const finishIdle = () => {
      window.clearInterval(idleTimer)
      window.clearTimeout(revealTimer)
      // A completed once scene cannot move again. Keep a hovered/pressed
      // cursor visible, or finish its existing idle delay with one timeout.
      const el = this.cursorEl
      const held = () => el?.hasAttribute('data-pressed') || stage.querySelector('[data-hover]')
      if (!cursor || idle === false || !el || el.hasAttribute('data-idle') || held()) return
      const delay = (this.moved ? idle : LEAD) - (performance.now() - this.active)
      revealTimer = window.setTimeout(() => {
        if (!held()) mark(el, 'data-idle')
      }, Math.max(0, delay))
    }

    const start = () => {
      if (ctrl || done || !onScreen || document.hidden) return
      if (play === 'hover' && !hovering) return
      this.cancelReset()
      if (cursor) this.placeAt(this.resolve(this.restAt()))
      ctrl = new AbortController()
      const signal = ctrl.signal
      watchIdle()
      const act = createAct<S>(signal, this.handle())
      void (async () => {
        do {
          beginLoop()
          try {
            await script!(act)
          } catch (e) {
            if (e instanceof Stopped) return
            // A real error in the script: report it once and stand the stage
            // down, so a later start() can run it again
            console.error('[stageshow] script error', e)
            ctrl = null
            unwatchIdle()
            return
          }
          if (play === 'loop' && isDev()) checkSeam(this.state, this.p.initial ?? NONE, this.pos, cursor ? this.resolve(this.restAt()) : null)
        } while (play === 'loop' && !signal.aborted)
        // Once holds its end state for good; hover holds it until the pointer leaves.
        if (play === 'once' && !signal.aborted) {
          done = true
          finishIdle()
        }
      })()
    }
    const stop = (glide = false) => {
      unwatchIdle()
      if (!ctrl) return
      ctrl.abort()
      ctrl = null
      if (!done) this.reset(glide)
    }

    const markOffscreen = () => stage.toggleAttribute('data-offscreen', !onScreen || document.hidden)
    markOffscreen()
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      // Off screen its CSS animations pause too, so nothing runs out of view
      markOffscreen()
      if (onScreen) start()
      else stop()
    })
    io.observe(fit)
    const onVisibility = () => {
      markOffscreen()
      if (document.hidden) stop()
      else start()
    }
    document.addEventListener('visibilitychange', onVisibility)
    const enter = () => {
      hovering = true
      start()
    }
    const leave = () => {
      hovering = false
      stop(true)
    }
    if (play === 'hover') {
      fit.addEventListener('pointerenter', enter)
      fit.addEventListener('pointerleave', leave)
    }
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      fit.removeEventListener('pointerenter', enter)
      fit.removeEventListener('pointerleave', leave)
      unwatchIdle()
      ctrl?.abort()
      ctrl = null
      this.auto = null
      this.cancelReset()
    }
  }

  /**
   * New props from a render of the page around the stage (mount.ts): a design
   * size taken from the slot, new children. The script keeps running, as a
   * component keeps its state when its parent re-renders.
   */
  setProps(p: StageProps<S>) {
    const was = this.p
    this.p = p
    if (was.width !== p.width || was.height !== p.height || was.compact?.width !== p.compact?.width || was.compact?.height !== p.compact?.height || was.compact?.below !== p.compact?.below || was.fill !== p.fill) this.fitNow()
    this.render()
  }

  /** Stop everything and let go of the page. */
  destroy() {
    this.stopPlayback?.()
    this.stopPlayback = null
    this.cleanups.forEach((fn) => fn())
    this.cleanups = []
    this.behaviors.forEach(dropBehavior)
    this.behaviors.clear()
    clock.cancelLayoutRaf(this.passes.frame)
    clock.cancelLayoutRaf(this.settleFrame)
    this.queued = false
  }
}
