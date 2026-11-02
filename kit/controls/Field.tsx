import type { Attrs, Child } from '../jsx-runtime'
import { behavior } from '../render'
import { Icon } from '../parts/Icon'
import './Field.css'

export interface FieldProps extends Omit<Attrs, 'children'> {
  label?: Child
  /** The typed value. Drive it with act.type(). */
  value: string
  placeholder?: string
  /** Focus ring and a blinking caret. */
  focused?: boolean
  /** Dots instead of the value. */
  password?: boolean
  /** valid: a check at the end and a calm ring. error: the ring turns danger. */
  status?: 'valid' | 'error'
  /** The typed value committed as a chip, in place (a filter on Enter): the
   * text stays where it was typed while a surface grows around it. Clear the
   * value and the chip together; the chip fades out holding its text. */
  chip?: boolean
  /** Gives the chip a remove ×, with this data-target for the cursor. */
  remove?: string
  leading?: Child
  trailing?: Child
  /** Props for the input box itself, the thing to click: data-target, data-cursor. */
  box?: Attrs & Record<`data-${string}`, unknown>
}

/**
 * A text field: label, box, value and caret. The focus ring fades in without
 * moving the text, the placeholder leaves the moment the first character
 * lands (and fades back when emptied), and the caret sits solid while typing,
 * blinking only once it rests. Put data-target on `box`, the part a cursor clicks.
 */
export function Field({ label, value, placeholder, focused, password, status, chip, remove, leading, trailing, box, className, style, ...rest }: FieldProps) {
  behavior('field', leaving)
  return (
    <div {...rest} className={`ss-field${className ? ` ${className}` : ''}`} data-ss-part="field" data-focused={focused || undefined} data-status={status} data-filled={value ? true : undefined} style={style}>
      {label && <span className="ss-field__label">{label}</span>}
      <div data-cursor="ibeam" {...box} className={`ss-field__box${box?.className ? ` ${box.className}` : ''}`}>
        {leading}
        <span className="ss-field__text">
          {placeholder && <span className="ss-field__placeholder">{placeholder}</span>}
          <span className="ss-field__value" data-password={password || undefined} data-chip={chip || undefined} data-removable={remove !== undefined || undefined}>
            <span className="ss-field__chars">{password ? '•'.repeat(value.length) : value}</span>
            {remove !== undefined && (
              <span className="ss-field__x" role="button" data-cursor="hand" data-target={remove || undefined}>
                <Icon name="close" size={10} stroke={1.8} />
              </span>
            )}
          </span>
          {/* Keyed on the value, so every keystroke restarts the blink from solid */}
          {focused && <span key={value.length} className="ss-field__caret" />}
        </span>
        {status === 'valid' && (
          <svg className="ss-field__ok" viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <path d="M3.5 8.5 6.5 11.5 12.5 4.5" pathLength={1} />
          </svg>
        )}
        {trailing}
      </div>
    </div>
  )
}

// A cleared chip keeps its text while it fades, then lets go. Kept only
// while its fade is visible: a stage reset can disable the transition before
// it starts, or cancel it halfway through.
function leaving(field: HTMLElement) {
  let held = ''
  let out = false
  const value = () => field.querySelector<HTMLElement>('.ss-field__value')
  const letGo = () => {
    out = false
    held = ''
    const v = value()
    if (!v) return
    v.removeAttribute('data-chip')
    v.removeAttribute('data-leaving')
    v.firstElementChild!.textContent = ''
  }
  const check = () => {
    const v = value()
    if (out && v && Number(getComputedStyle(v).opacity) === 0) letGo()
  }
  const settle = (event: Event) => {
    if (event.target === value() && (event as TransitionEvent).propertyName === 'opacity') check()
  }
  field.addEventListener('transitionend', settle)
  field.addEventListener('transitioncancel', settle)
  const read = (v: Element | null) => ({ chip: !!v?.hasAttribute('data-chip'), text: v?.firstElementChild?.textContent ?? '' })
  held = read(value()).chip ? read(value()).text : ''
  return {
    morph(next: Element) {
      const v = next.querySelector('.ss-field__value')
      const { chip, text } = read(v)
      if (chip || text) {
        held = chip ? text : ''
        out = false
        return
      }
      if (!held || !v) return
      // Leaving: the chip holds its text while it fades
      out = true
      v.setAttribute('data-chip', 'true')
      v.setAttribute('data-leaving', 'true')
      v.firstElementChild!.textContent = held
    },
    update: check,
    destroy() {
      field.removeEventListener('transitionend', settle)
      field.removeEventListener('transitioncancel', settle)
    },
  }
}
