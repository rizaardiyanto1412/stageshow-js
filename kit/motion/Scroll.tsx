import type { Child, Style } from '../jsx-runtime'
import { thumb } from '../measure'
import { behavior } from '../render'
import './Scroll.css'

/**
 * A scrolling area with a scrollbar, driven by `a.scroll(name, to)`. The bar
 * is macOS's overlay bar: hidden at rest, shown while the content moves, fading
 * once it stops. `bar="always"` keeps it visible (Windows, or a still that
 * needs to say "this scrolls"). Rows cut at an edge soften once it has scrolled.
 */
export function Scroll({ name, bar = 'overlay', className, style, children, ...rest }: { name: string; bar?: 'overlay' | 'always' | 'none'; className?: string; style?: Style; children: Child } & Record<`data-${string}`, unknown>) {
  behavior('scroller', (el) => ({ update: () => thumb(el.firstElementChild as HTMLElement) }))
  return (
    <div {...rest} className={`ss-scroller${className ? ` ${className}` : ''}`} data-ss-part="scroller" data-bar={bar} style={style}>
      <div className="ss-scroll" data-target={name}>
        {children}
      </div>
      {bar !== 'none' && <span className="ss-scroller__thumb" />}
    </div>
  )
}
