import type { Child, Style } from '../jsx-runtime'
import { behavior, hold } from '../render'
import './Tabs.css'

/**
 * A row of tabs with an underline that slides to the active one, measured,
 * so tabs can be any width. `targets` names each tab for the cursor.
 */
export function Tabs({ items, value, targets, className, style, ...rest }: { items: Child[]; value: number; targets?: (string | undefined)[]; className?: string; style?: Style } & Record<`data-${string}`, unknown>) {
  behavior('tabs', (row) => ({
    // Measured under the active tab after each render
    update() {
      const el = row.querySelector<HTMLElement>(':scope > .ss-tabs__tab[data-on]')
      if (el) hold(row.firstElementChild as HTMLElement, 'transform', `translateX(${el.offsetLeft}px) scaleX(${el.offsetWidth})`)
    },
  }))
  return (
    <div {...rest} className={`ss-tabs${className ? ` ${className}` : ''}`} data-ss-part="tabs" style={style}>
      {/* A 1px line scaled to the tab's width: it slides on transform alone */}
      <span className="ss-tabs__bar" style={{ transform: 'translateX(0px) scaleX(0)' }} />
      {items.map((t, i) => (
        <span key={i} className="ss-tabs__tab" data-on={i === value || undefined} data-target={targets?.[i]}>
          {t}
        </span>
      ))}
    </div>
  )
}
