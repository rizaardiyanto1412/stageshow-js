import { Html, type Child, type Style } from './jsx-runtime'
import { behavior, hold, mark, stillAt } from './render'
import { look } from './render'
import { Roll } from './motion/Roll'
import './messages.css'

// Message threads the way messaging apps draw them: runs of bubbles where only
// the last in a run has a tail, a typing indicator that grows into the reply,
// and older messages easing up as new ones arrive. One part for iMessage-style
// threads and for AI chat, where the reply is plain text with no bubble.

// Threads that have finished their first render: bubbles there from the
// start are the opening picture and don't rise in; only arrivals do
const ready = new WeakSet<Element>()

// A rendered Bubble that remembers its props, so a Thread can give the last
// bubble of each run its tail
class BubbleHtml extends Html {
  constructor(
    readonly props: BubbleProps,
    html: string,
  ) {
    super(html)
  }
}
const flat = (c: Child): Child[] => (Array.isArray(c) ? c.flatMap(flat) : [c])

// offsetTop rounds to whole pixels. Keep fractional positions through the
// FLIP, including inside a scaled Phone, or a row steps before its glide starts.
function threadTops(root: HTMLElement) {
  const style = getComputedStyle(root)
  const extra = style.boxSizing === 'border-box' ? 0 :
    [style.paddingLeft, style.paddingRight, style.borderLeftWidth, style.borderRightWidth].reduce((sum, value) => sum + (parseFloat(value) || 0), 0)
  const width = parseFloat(style.width) + extra
  const scale = (width && root.getBoundingClientRect().width / width) || 1
  const parents = new Map<Element, number>()
  return new Map(Array.from(root.children, (el) => {
    const parent = (el as HTMLElement).offsetParent
    if (parent && !parents.has(parent)) parents.set(parent, parent.getBoundingClientRect().top)
    return [el, (el.getBoundingClientRect().top - (parent ? parents.get(parent)! : 0)) / scale]
  }))
}

export interface ThreadProps {
  /**
   * imessage: blue and gray bubbles with tails (sms for green). chat: the
   * AI-app look, a quiet gray bubble for the person and plain text for the reply.
   */
  app?: 'imessage' | 'sms' | 'chat'
  className?: string
  style?: Style
  children?: Child
}

/**
 * A column of messages pinned to its bottom, as a conversation is. Messages
 * already on screen glide up when one arrives instead of jumping; the thread
 * clips what scrolls off its top, so put it under a header or let the stage
 * crop it. Tails go on the last bubble of each run automatically.
 */
export function Thread({ app = 'imessage', className, style, children }: ThreadProps) {
  behavior('thread', gliding)
  // A tail closes each run: the last bubble before the sender changes
  const list = flat(children)
  const bubbles = list.filter((c): c is BubbleHtml => c instanceof BubbleHtml)
  const out = list.map((c) => {
    if (!(c instanceof BubbleHtml) || c.props.tail !== undefined) return c
    const next = bubbles[bubbles.indexOf(c) + 1]
    return Bubble({ ...c.props, tail: !next || next.props.from !== c.props.from })
  })
  return (
    <div className={`ss-thread${className ? ` ${className}` : ''}`} data-ss-part="thread" data-app={app} style={style}>
      {out}
    </div>
  )
}

// Glide: every message that moved since the last render starts where it
// was and eases to where it is (FLIP), so an arrival pushes the rest up.
// Where each message is right before an update is read fresh every time,
// not remembered from the last one: CSS motion in between (a receipt
// opening, a bubble growing) moves messages without a render, and a stale
// position would glide them from somewhere they no longer are
function gliding(root: HTMLElement) {
  let tops = new Map<Element, number>()
  let first = true
  return {
    morph() {
      tops = threadTops(root)
    },
    update() {
      if (first) {
        first = false
        queueMicrotask(() => ready.add(root))
        return
      }
      const next = threadTops(root)
      for (const [node, top] of Array.from(next)) {
        const el = node as HTMLElement
        const was = tops.get(el)
        if (was === undefined || Math.abs(was - top) < 0.001) continue
        // Start from where it is on screen: a glide still under way continues
        // from its current offset instead of jumping back
        // (by top, on the layer each row keeps, so a bubble's words neither hop
        // as they land nor step inside the bubble on the way)
        const now = parseFloat(getComputedStyle(el).top) || 0
        el.style.transition = 'none'
        el.style.top = `${was + now - top}px`
        void el.offsetWidth
        el.style.transition = ''
        el.style.top = ''
      }
      tops = new Map()
    },
  }
}

export interface BubbleProps {
  /** me sits on the right in the accent bubble; them on the left. */
  from: 'me' | 'them'
  /** Three bouncing dots in place of the text. Turning it off grows the bubble into the message. */
  typing?: boolean
  /** Set by Thread: true on the last bubble of a run. */
  tail?: boolean
  /**
   * Where the message comes from, as iMessage sends: a target name (or a
   * CSS selector) for the composer's text. The bubble forms out of it, the words
   * lifting from the field into place while the bubble fills in around them,
   * instead of rising in. Clear the field in the same update that adds the bubble.
   */
  source?: string
  /**
   * A tapback on this bubble: the emoji, and `show` to pop it in and out. It
   * sits in a white circle on the bubble's bottom corner, and the bubble makes
   * room below so the emoji never covers the words.
   */
  tapback?: { emoji: Child; show?: boolean }
  /** A small `Avatar` beside a received bubble, as a group chat shows who is speaking. */
  avatar?: Child
  className?: string
  style?: Style
  children?: Child
  /** data-target and other data attributes land on the bubble itself. */
  [data: `data-${string}`]: unknown
}

/**
 * One message. Bubbles in the thread on its first render are the opening
 * picture and don't animate; only later arrivals rise in. In minimal
 * fidelity a string message becomes a bar.
 */
export function Bubble({ avatar, from, typing = false, tail, source, tapback, className, style, children, ...data }: BubbleProps) {
  const { fidelity } = look()
  behavior('bubble', bubbling)
  let body = children
  if (fidelity === 'minimal' && typeof children === 'string') body = <span className="ss-bar ss-bubble__bar" style={{ width: Math.min(180, children.length * 5.5) }} />
  return new BubbleHtml(
    { avatar, from, typing, tail, source, tapback, className, style, children, ...data },
    (
    <div className={`ss-bubble-row${className ? ` ${className}` : ''}`} data-from={from} data-avatar={avatar ? '' : undefined} style={style}>
      {avatar && from !== 'me' && <span className="ss-bubble__avatar" aria-hidden>{avatar}</span>}
      <div {...data} className="ss-bubble" data-ss-part="bubble" data-source={source || undefined} data-tail={tail || undefined} data-typing={typing || undefined} data-tapback={tapback && tapback.show !== false ? '' : undefined}>
        {tapback && (
          <span className="ss-tapback" data-show={tapback.show !== false || undefined} aria-hidden>
            <span className="ss-tapback__emoji">{tapback.emoji}</span>
          </span>
        )}
        {typing ? (
          <span className="ss-bubble__dots" aria-label="typing">
            <i />
            <i />
            <i />
          </span>
        ) : (
          <span className="ss-bubble__text">{body}</span>
        )}
        {/* Always drawn, so a tail grows out of the corner when its bubble
            becomes the last of a run, and retracts when it stops being */}
        <svg className="ss-bubble__tail" viewBox="0 0 18 16" aria-hidden>
          <path d={from === 'me' ? 'M0 0H12V8.5C12 12.6 14 15 17.5 16C15 16.7 12.2 16.5 9.8 15.3L0 15Z' : 'M18 0H6V8.5C6 12.6 4 15 0.5 16C3 16.7 5.8 16.5 8.2 15.3L18 15Z'} />
        </svg>
      </div>
    </div>
    ).html,
  )
}

// One bubble on the page: whether it arrived after its thread's opening
// picture, whether it grew out of the typing dots (its words fade in as it
// grows), and its box easing between sizes when its content changes
function bubbling(el: HTMLElement) {
  let size: { w: number; h: number } | null = null
  let typing = el.hasAttribute('data-typing')
  let first = true
  const text = () => el.querySelector<HTMLElement>(':scope > .ss-bubble__text')
  // Morph: measure the bubble before and after the content changes, then ease
  // its box from the old size to the new
  const resize = () => {
    hold(el, 'width', null)
    hold(el, 'height', null)
    // Resolved CSS dimensions retain the fractions offsetWidth/Height round
    // away, so releasing the measured box doesn't resize it at the endpoint.
    const measured = getComputedStyle(el)
    const now = { w: parseFloat(measured.width), h: parseFloat(measured.height) }
    const was = size
    size = now
    if (!was || (was.w === now.w && was.h === now.h)) return
    // The words keep their final line breaks while the box grows around them
    const t = text()
    if (t) hold(t, 'width', getComputedStyle(t).width)
    el.style.transition = 'none'
    hold(el, 'width', `${was.w}px`)
    hold(el, 'height', `${was.h}px`)
    void el.offsetWidth
    el.style.transition = ''
    hold(el, 'width', `${now.w}px`)
    hold(el, 'height', `${now.h}px`)
    const end = () => {
      hold(el, 'width', null)
      hold(el, 'height', null)
      hold(text(), 'width', null)
    }
    el.addEventListener('transitionend', end, { once: true })
  }
  // Form out of the composer: start where the field's words were, in the
  // field's color with no fill, and travel into place as the fill comes in
  const fly = () => {
    const source = el.dataset.source
    if (!source) return
    const stage = el.closest('.ss-stage') ?? document
    const src = stage.querySelector<HTMLElement>(`[data-target="${source}"]`) ?? stage.querySelector<HTMLElement>(source)
    const t = text()
    if (!src || !t || stillAt(el)) return
    // Measure where it rests, not where an earlier run already moved it
    el.style.transition = 'none'
    el.style.left = el.style.top = '0px'
    const k = el.getBoundingClientRect().width / el.offsetWidth || 1
    const o = src.getBoundingClientRect()
    const r = t.getBoundingClientRect()
    const dx = (o.left - r.left) / k
    const dy = (o.top + o.height / 2 - (r.top + r.height / 2)) / k
    const ease = 'cubic-bezier(0.22, 1, 0.36, 1)'
    // Travels by left and top, so the words land without a sub-pixel hop
    hold(el, 'transition', 'none')
    hold(el, 'left', `${dx}px`)
    hold(el, 'top', `${dy}px`)
    hold(el, 'color', getComputedStyle(src).color)
    mark(el, 'data-flying')
    void el.offsetWidth
    hold(el, 'transition', `left 0.5s ${ease}, top 0.5s ${ease}, color 0.3s ease 0.06s`)
    hold(el, 'left', null)
    hold(el, 'top', null)
    hold(el, 'color', null)
    mark(el, 'data-flying', null)
    const end = (e: TransitionEvent) => {
      if (e.target !== el || e.propertyName !== 'top') return
      hold(el, 'transition', null)
      el.removeEventListener('transitionend', end)
    }
    el.addEventListener('transitionend', end)
  }
  return {
    morph(next: Element) {
      const now = next.hasAttribute('data-typing')
      if (typing && !now) mark(el, 'data-grew')
      typing = now
    },
    update() {
      if (first) {
        first = false
        const thread = el.closest('.ss-thread')
        if (!thread || ready.has(thread)) {
          mark(el, 'data-arrived', 'true')
          fly()
        }
      }
      resize()
    },
  }
}

/** A centered timestamp between runs ("Today 9:41"). */
export function Stamp({ children, className }: { children: Child; className?: string }) {
  return <div className={`ss-stamp${className ? ` ${className}` : ''}`}>{children}</div>
}

/**
 * The small status under your last message. `children` rolls when it changes
 * (Delivered to Read); `show` false folds it away.
 */
export function Receipt({ show = true, children, className }: { show?: boolean; children: string; className?: string }) {
  return (
    <div className={`ss-receipt${className ? ` ${className}` : ''}`} data-show={show || undefined}>
      <span>
        <Roll variant="fade">{children}</Roll>
      </span>
    </div>
  )
}
