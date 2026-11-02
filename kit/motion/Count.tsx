import type { Attrs } from '../jsx-runtime'
import { behavior, stillAt } from '../render'
import './Count.css'

export interface CountProps extends Attrs {
  value: number
  /** How a number is written, e.g. n => `$${n.toFixed(2)}` */
  format?: (n: number) => string
  /** ms for a digit to roll from the old figure to the new one. */
  duration?: number
  /** ms between one digit starting and the next, from the right. */
  stagger?: number
}

// Three decades of figures, so a digit can roll on past 9 into 0 (or back
// past 0 into 9) without ever running off the end of the strip
const STRIP = '012345678901234567890123456789'.split('')
const MIDDLE = 10

// A unit after the figure ("21°", "240ms", "40%", "12 min"): the run of
// letters or signs that ends the text, after its last digit. It gets a box of
// its own, a hair from the digits (a word space when the format writes one),
// so the pair reads as one figure without the unit sitting on the last digit
const unitOf = (text: string) => {
  const m = /^(.*\d)(\s*)([^\d\s.,]+)$/.exec(text)
  return m ? { head: m[1], space: m[2].length > 0, unit: m[3] } : { head: text, space: false, unit: '' }
}

const digitsFromRight = (text: string) => {
  const out: number[] = []
  for (let i = text.length - 1; i >= 0; i--) {
    const c = text[i]
    if (c >= '0' && c <= '9') out.push(Number(c))
  }
  return out
}

/**
 * A number whose digits roll to each new value, the way a counter does:
 * each changed digit turns from the old figure to the new one, the last digit
 * first, so a total settles from the right. A rise rolls the figures up, a
 * fall rolls them down, and a digit passing 9 carries on into 0 rather than
 * spinning back. Unchanged digits and the punctuation hold still. Tabular
 * figures keep every column the same width. A unit the format writes after
 * the figure ("21°", "240ms", "40%") sits in a box of its own
 * (`.ss-count__unit`), a hair from the last digit, or a word space when the
 * format has one ("12 min"); restyle it there for a smaller or lighter unit,
 * and set `--ss-count-unit-gap` to widen the hair. Inside an `act.snap` or an
 * offscreen reset it jumps to the value, so unseen resets stay unseen.
 */
export function Count({ value, format = (n) => Math.round(n).toLocaleString('en-US'), duration = 700, stagger = 45, className, style, ...rest }: CountProps) {
  behavior('count', counting)
  const text = format(value)
  return (
    <span {...rest} className={`ss-count${className ? ` ${className}` : ''}`} style={style} aria-label={text} data-ss-part="count" data-value={value} data-duration={duration} data-stagger={stagger}>
      {figures(text, digitsFromRight(text).map((d) => MIDDLE + d), duration, stagger)}
    </span>
  )
}

// The columns for a text, each digit's strip at its index. Columns are keyed
// from the right, so a total that gains a digit keeps the digits it already
// had rolling in place and only the new leading one appears
function figures(text: string, idx: number[], duration: number, stagger: number) {
  const { head, space, unit } = unitOf(text)
  let fromRight = digitsFromRight(text).length
  return (
    <>
      {head.split('').map((c, i) => {
        if (c < '0' || c > '9') return <span key={`s${i}-${c}`} className="ss-count__char" aria-hidden>{c}</span>
        const column = --fromRight
        const at = idx[column] ?? MIDDLE + Number(c)
        return (
          <span key={`d${column}`} className="ss-count__digit" data-crop aria-hidden>
            <span className="ss-count__strip" style={{ transform: `translateY(${-at}em)`, transitionDuration: `${duration}ms`, transitionDelay: `${column * stagger}ms` }}>
              {STRIP.map((n) => <span>{n}</span>)}
            </span>
          </span>
        )
      })}
      {unit && <span className="ss-count__unit" data-space={space || undefined} aria-hidden>{unit}</span>}
    </>
  )
}

// Where each column's strip sits, by column from the right. Starts in the
// middle decade; a change moves it by the shortest turn in the value's
// direction, and it is put back in the middle once the roll has settled
function counting(node: HTMLElement) {
  let shown = { text: node.getAttribute('aria-label') ?? '', value: Number(node.dataset.value), idx: digitsFromRight(node.getAttribute('aria-label') ?? '').map((d) => MIDDLE + d) }
  let home = 0
  const strips = () => Array.from(node.querySelectorAll<HTMLElement>('.ss-count__strip'))
  // The columns, patched in place so each strip transitions from where it is
  const draw = (text: string, idx: number[], duration: number, stagger: number) => {
    const next = node.cloneNode(false) as HTMLElement
    next.innerHTML = figures(text, idx, duration, stagger).html
    // Keyed columns keep their strips: move what exists, add or drop the rest
    const old = new Map(Array.from(node.children).map((c) => [c.getAttribute('data-ss-key'), c]))
    const kids = Array.from(next.children).map((c) => {
      const was = old.get(c.getAttribute('data-ss-key'))
      if (!was || was.className !== c.className) return c
      const strip = was.querySelector<HTMLElement>('.ss-count__strip')
      const want = c.querySelector<HTMLElement>('.ss-count__strip')
      if (strip && want) strip.setAttribute('style', want.getAttribute('style') ?? '')
      else was.textContent = c.textContent
      return was
    })
    // In place: a strip taken out and put back would lose its transition
    kids.forEach((kid, i) => {
      if (node.children[i] !== kid) node.insertBefore(kid, node.children[i] ?? null)
    })
    while (node.children.length > kids.length) node.lastElementChild!.remove()
  }
  return {
    morph(next: Element) {
      const n = next as HTMLElement
      const text = n.getAttribute('aria-label') ?? ''
      const value = Number(n.dataset.value)
      const duration = Number(n.dataset.duration ?? 700)
      const stagger = Number(n.dataset.stagger ?? 45)
      // The roll's own marks stay with the live element through any render
      const keep = () => {
        next.toggleAttribute('data-snap', node.hasAttribute('data-snap'))
        next.toggleAttribute('data-rolling', node.hasAttribute('data-rolling'))
        return false
      }
      if (text === shown.text) return keep()
      const instant = stillAt(node) || duration <= 0 || !!node.closest('[data-instant], [data-offscreen]')
      const before = digitsFromRight(shown.text)
      const digits = digitsFromRight(text)
      const up = value >= shown.value
      const idx = digits.map((d, c) => {
        const was = before[c]
        const at = shown.idx[c]
        if (was === undefined || at === undefined || instant) return MIDDLE + d
        if (was === d) return at
        return up ? at + ((d - was + 10) % 10) : at - ((was - d + 10) % 10)
      })
      node.toggleAttribute('data-snap', instant)
      // Settle the old transforms in the browser first, so the new ones transition
      if (!instant) {
        for (const strip of strips()) void getComputedStyle(strip).transform
        node.setAttribute('data-rolling', '')
      }
      shown = { text, value, idx }
      draw(text, idx, duration, stagger)
      // Once every digit has landed, put the strips back in the middle decade
      // without a transition, and drop the rolling mark a still waits on
      clearTimeout(home)
      if (!instant)
        home = window.setTimeout(() => {
          node.setAttribute('data-snap', '')
          shown.idx = digits.map((d) => MIDDLE + d)
          draw(text, shown.idx, duration, stagger)
          node.removeAttribute('data-rolling')
          for (const strip of strips()) void getComputedStyle(strip).transform
          node.removeAttribute('data-snap')
        }, duration + stagger * digits.length + 60)
      return keep()
    },
    destroy() {
      clearTimeout(home)
    },
  }
}
