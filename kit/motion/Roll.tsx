import type { Style } from '../jsx-runtime'
import { behavior, stillAt } from '../render'
import './Roll.css'

/**
 * Text that rolls when it changes. Only the part that differs moves: in
 * "$0.01 per 1,000" to "$0.0098 per 1,000", "$0.0" and " per 1,000" hold still
 * while the old digits slide up and out and the new ones rise in one by one.
 * Words move whole: "Checking calendars" to "Everyone can make it" rolls word
 * by word, and a change never splits a word.
 * The changing part eases to its new width, so the text after it moves with it.
 * For prices, counts in words, statuses and labels.
 */
export function Roll({ delay = 0, children, stagger = 45, variant = 'roll', align, className, style }: {
  children: string
  /** Hold the old text this many ms before rolling: a total that changes
   * after the row that caused it has landed, not on the same frame. */
  delay?: number
  stagger?: number
  /** The side the text is pinned to. Found from the layout when left out: a
   * right-aligned value (text-align right, or last in a space-between or
   * flex-end row) changes against its right edge, so it never drifts. */
  align?: 'start' | 'end'
  /** 'roll' slides text up through the line, for numbers and inline text. 'fade'
   * crossfades in place with a small lift, for labels on buttons and other
   * controls, where a full roll shows two lines at once. */
  variant?: 'roll' | 'fade'
  className?: string
  style?: Style
}) {
  behavior('roll', rolling)
  // The settled text; the behavior rolls the live element from what it shows to this
  return (
    <span className={`ss-roll${className ? ` ${className}` : ''}`} data-ss-part="roll" data-variant={variant} data-align={align ?? 'start'} data-pin={align} data-text={children} data-delay={delay || undefined} data-stagger={stagger} style={style}>
      <span className="ss-roll__mid">
        <span className="ss-roll__item" data-live>
          {children}
        </span>
      </span>
    </span>
  )
}

function rolling(root: HTMLElement) {
  let text = root.dataset.text ?? ''
  let key = 0
  let held = 0
  let clearOut = 0
  let widen = 0
  const mid = () => root.querySelector<HTMLElement>(':scope > .ss-roll__mid')!
  // Inline text has no computed width. Use the line box's scale to convert
  // its painted width back to local CSS pixels, including inside a Phone or
  // Camera. offsetWidth rounds away the fractions that keep a suffix still.
  const rootWidth = () => {
    const m = mid()
    const height = parseFloat(getComputedStyle(m).height)
    const scale = height > 0 ? m.getBoundingClientRect().height / height : 1
    return root.getBoundingClientRect().width / (scale || 1)
  }
  const width = (node: HTMLElement) => parseFloat(getComputedStyle(node).width) || 0

  // The side it pins to, from the layout unless given
  const pin = () => {
    if (root.dataset.pin) return void (root.dataset.align = root.dataset.pin)
    // Look through wrappers that only hold the roll (a <b>, a value span):
    // they size to it, so where the wrapper sits is where the text pins
    let box: HTMLElement = root
    while (box.parentElement && box.parentElement.childElementCount === 1 && Math.abs(box.parentElement.getBoundingClientRect().width - box.getBoundingClientRect().width) < 1) box = box.parentElement
    const parent = box.parentElement
    if (!parent) return
    const p = getComputedStyle(parent)
    const flex = /flex/.test(p.display) && p.flexDirection.startsWith('row')
    // Pushed to the right edge by an auto margin (or anything else) reads the
    // same from the layout: flush with the row's end, slack before it
    const pushed = () => {
      const prev = box.previousElementSibling
      const r = box.getBoundingClientRect()
      const pr = parent.getBoundingClientRect()
      const flush = Math.abs(pr.right - parseFloat(p.paddingRight) - parseFloat(p.borderRightWidth) - r.right) < 1
      const slack = prev ? r.left - prev.getBoundingClientRect().right - (parseFloat(p.columnGap) || 0) : 0
      return flush && slack > 1
    }
    const end = /right|end/.test(getComputedStyle(root).textAlign) || (flex && box === parent.lastElementChild && (/space-between|flex-end|^end/.test(p.justifyContent) || pushed()))
    root.dataset.align = end ? 'end' : 'start'
  }

  // The settled text, no motion
  const place = (b: string) => {
    clearTimeout(clearOut)
    clearTimeout(widen)
    text = b
    root.replaceChildren(build('', b, '', '', false, true))
    const m = mid()
    m.style.transition = 'none'
    m.style.width = `${width(m.firstElementChild as HTMLElement)}px`
  }

  const roll = (b: string) => {
    const a = text
    if (a === b) return
    if (stillAt(root)) return place(b)
    let head = 0
    while (head < a.length && head < b.length && a[head] === b[head]) head++
    let tail = 0
    while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++
    // Digits can change one at a time; words can't. Snap a wordy change out to
    // whole words.
    const numeric = /^[\d.,$€£%+\-−\s]*$/.test(a.slice(head, a.length - tail) + b.slice(head, b.length - tail))
    if (!numeric) {
      const space = (c: string | undefined) => c === undefined || /\s/.test(c)
      while (head > 0 && !space(b[head - 1]) && !space(b[head])) head--
      while (tail > 0 && !space(b[b.length - tail - 1]) && !space(b[b.length - tail])) tail--
    }
    key++
    const mine = key
    // Capture the rendered width before repartitioning head/middle/tail.
    // During interruption this is between endpoints, not the old target.
    const fromWidth = rootWidth()
    text = b
    const old = a.slice(head, a.length - tail)
    root.replaceChildren(build(b.slice(0, head), b.slice(head, b.length - tail), b.slice(b.length - tail), old, numeric, false))
    clearTimeout(clearOut)
    clearOut = window.setTimeout(() => {
      if (key === mine) mid().querySelector('[data-out]')?.remove()
    }, 700)
    // While the old and new text swap, the box starts at the old text's width,
    // opens to the wider of the two so neither runs into what follows, then
    // settles to the new width
    const m = mid()
    const live = m.querySelector<HTMLElement>('[data-live]')!
    const out = m.querySelector<HTMLElement>('[data-out]')
    const next = width(live)
    // Repartitioning moves unchanged text out of the grid. Subtract its new
    // width from the old rendered total so that move itself changes no room.
    const affixes = rootWidth() - width(m)
    const start = Math.max(0, fromWidth - affixes)
    m.style.transition = 'none'
    m.style.width = `${start}px`
    void m.offsetWidth
    m.style.transition = ''
    clearTimeout(widen)
    // A control's label: the box and the crossfade are one move, straight to
    // the new width, and the box clips the old label as it goes
    if (root.dataset.variant === 'fade') {
      m.style.width = `${next}px`
      return
    }
    const widest = Math.max(next, start, out ? width(out) : 0)
    m.style.width = `${widest}px`
    if (widest !== next) widen = window.setTimeout(() => (m.style.width = `${next}px`), 360)
  }

  // The parts: unchanged head, the changing middle (old going, new arriving
  // one character or word at a time), unchanged tail
  const build = (head: string, now: string, tail: string, old: string, numeric: boolean, settled: boolean) => {
    const frag = document.createDocumentFragment()
    if (head) frag.append(head)
    const m = document.createElement('span')
    m.className = 'ss-roll__mid'
    if (old) {
      const o = document.createElement('span')
      o.className = 'ss-roll__item'
      o.setAttribute('data-out', '')
      o.textContent = old
      m.append(o)
    }
    const live = document.createElement('span')
    live.className = 'ss-roll__item'
    live.setAttribute('data-live', '')
    if (settled) live.textContent = now
    else if (root.dataset.variant === 'fade') {
      const c = document.createElement('span')
      c.className = 'ss-roll__char'
      c.textContent = now
      live.append(c)
    } else {
      const stagger = Number(root.dataset.stagger ?? 45)
      // Characters for numbers, whole words (with their spaces) for text
      const units = numeric ? now.split('') : now.split(/(?<=\s)/)
      units.forEach((u, i) => {
        const c = document.createElement('span')
        c.className = 'ss-roll__char'
        c.style.animationDelay = `${110 + i * stagger}ms`
        c.textContent = u
        live.append(c)
      })
    }
    m.append(live)
    frag.append(m)
    if (tail) frag.append(tail)
    return frag
  }

  let first = true
  return {
    morph(next: Element) {
      const b = (next as HTMLElement).dataset.text ?? ''
      // A total that changes after the row that caused it has landed
      const delay = Number((next as HTMLElement).dataset.delay ?? 0)
      clearTimeout(held)
      if (b !== text) {
        if (delay && !stillAt(root)) held = window.setTimeout(() => roll(b), delay)
        else roll(b)
      }
      // The live element keeps what it shows; the render's own markup is the settled text
      next.setAttribute('data-align', root.dataset.align ?? 'start')
      return false
    },
    update() {
      if (!first) return
      first = false
      pin()
      place(text)
    },
    destroy() {
      clearTimeout(held)
      clearTimeout(clearOut)
      clearTimeout(widen)
    },
  }
}
