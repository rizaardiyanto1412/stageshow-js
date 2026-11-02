import type { Child, Style } from './jsx-runtime'
import { behavior, mark } from './render'
import './code.css'

// Code as the subject: real lines in a monospace block with line numbers,
// quiet syntax color, and diff lines that read at a glance.

export interface CodeLine {
  text: string
  /** add: a green line with a +. del: a red line with a −. */
  kind?: 'add' | 'del'
  /** false leaves this line's number blank (a wrapped continuation, a fold). */
  number?: boolean
}

const KEYWORDS = /^(const|let|var|function|return|if|else|await|async|import|from|export|default|new|true|false|null|undefined|for|of|in|while|try|catch|throw|class|extends|type|interface|def|self|None|True|False)$/

/** A light tokenizer: comments, strings, numbers, keywords, function calls. */
function tokens(line: string): Child[] {
  const out: Child[] = []
  const re = /(\/\/.*$|#.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|(\b\d[\d._]*\b)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index))
    const [text, com, str, num, call, word] = m
    const kind = com ? 'com' : str ? 'str' : num ? 'num' : call ? (KEYWORDS.test(call) ? 'key' : 'fn') : word && KEYWORDS.test(word) ? 'key' : null
    out.push(kind ? <span key={k++} className={`ss-code__${kind}`}>{text}</span> : text)
    last = m.index + text.length
  }
  if (last < line.length) out.push(line.slice(last))
  return out
}

/**
 * Lines of code. `count` shows only the first n lines, the rest laid out but
 * hidden, so a block can stream in (a build log, a generated function) without
 * anything reflowing. Diff lines get a tint and a + or − in the gutter.
 */
export function Code({ lines, start = 1, numbers = true, count, highlight = true, className, style }: { lines: (CodeLine | string)[]; start?: number; numbers?: boolean; count?: number; highlight?: boolean; className?: string; style?: Style }) {
  let n = start
  // Only lines that really run past the block fade at the edge
  behavior('code', (block) => {
    const over = () => block.querySelectorAll<HTMLElement>('.ss-code__text').forEach((t) => mark(t, 'data-over', t.scrollWidth > t.clientWidth + 1))
    const ro = new ResizeObserver(over)
    ro.observe(block)
    return { update: over, destroy: () => ro.disconnect() }
  })
  return (
    <div className={`ss-code${className ? ` ${className}` : ''}`} data-ss-part="code" style={style}>
      {lines.map((raw, i) => {
        const line = typeof raw === 'string' ? { text: raw } : raw
        // A removed line keeps the old number; the line after it reuses it
        const num = line.kind === 'del' || line.number === false ? n : n++
        return (
          <div key={i} className="ss-code__line" data-kind={line.kind} data-on={count === undefined || i < count || undefined}>
            {numbers && <span className="ss-code__num">{line.kind === 'del' || line.number === false ? '' : num}</span>}
            <span className="ss-code__mark">{line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ''}</span>
            <span className="ss-code__text">{highlight ? tokens(line.text) : line.text}</span>
          </div>
        )
      })}
    </div>
  )
}
