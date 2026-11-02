import type { Child, Style } from '../jsx-runtime'
import { look } from '../render'
import './Toast.css'

/**
 * A confirmation that rises in from the bottom of whatever it sits in: "Snoozed
 * until 8:00 AM", "Link copied". Dark pill on light themes, raised surface on
 * dark. Position its container where the product shows toasts; it stays in
 * the DOM and fades, so it never pops.
 */
export function Toast({ show, icon, children, action, className, style, ...rest }: { show: boolean; icon?: Child; children: Child; action?: Child; className?: string; style?: Style } & Record<`data-${string}`, unknown>) {
  const { fidelity } = look()
  // Minimal: words become a placeholder line, as everywhere else
  if (fidelity === 'minimal' && typeof children === 'string') children = <span className="ss-bar" style={{ width: Math.min(160, children.length * 5.5), height: 6, borderRadius: 3, background: 'var(--ss-ink-3)', display: 'inline-block' }} />
  return (
    <div {...rest} className={`ss-toast${className ? ` ${className}` : ''}`} data-show={show || undefined} style={style} role="status">
      {icon && <span className="ss-toast__icon">{icon}</span>}
      <span>{children}</span>
      {action && <span className="ss-toast__action">{action}</span>}
    </div>
  )
}
