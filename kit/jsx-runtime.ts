// JSX that renders to an HTML string. Scenes are written in JSX for
// readability, but nothing here is a framework: a component is a function
// from props to markup, called once per render, with no state of its own.
// The stage re-renders a scene's markup when its state changes and patches
// the live DOM to match (render.ts), so CSS transitions run as they would on
// any page. Attributes follow React's rules, so markup written for React
// renders the same: className, style objects with px for plain numbers,
// data-* booleans as "true" and "false", and null, undefined and false left out.

/** Markup that is already HTML, as opposed to text that still needs escaping. */
export class Html {
  constructor(readonly html: string) {}
  toString() {
    return this.html
  }
}

/** Anything a scene can put in its markup. */
export type Child = Html | string | number | bigint | boolean | null | undefined | Child[]

/** A style object, as React takes it: camelCase properties, numbers in px where a unit is needed. */
export type Style = { [property: string]: string | number | null | undefined }

/** The attributes a part passes through to its element: class, style, data-* and the rest. */
export type Attrs = { className?: string; style?: Style; children?: Child; id?: string; role?: string; title?: string; [attribute: `data-${string}` | `aria-${string}`]: unknown }

export type Props = { children?: Child; [prop: string]: unknown }
export type Component<P = Props> = (props: P) => Html

/** Trusted markup, inserted as is (an SVG from a file, a brand mark). */
export const raw = (html: string) => new Html(html)

const ESCAPE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ESCAPE[c])

/** A child, or a list of them, as HTML. */
export function html(child: Child): string {
  if (child === null || child === undefined || child === false || child === true) return ''
  if (child instanceof Html) return child.html
  if (Array.isArray(child)) {
    let out = ''
    for (const c of child) out += html(c)
    return out
  }
  return escape(String(child))
}

// Properties React writes without a px unit when given a plain number
const UNITLESS = new Set([
  'animationIterationCount', 'aspectRatio', 'borderImageOutset', 'borderImageSlice', 'borderImageWidth', 'boxFlex', 'boxFlexGroup',
  'boxOrdinalGroup', 'columnCount', 'columns', 'flex', 'flexGrow', 'flexPositive', 'flexShrink', 'flexNegative', 'flexOrder', 'gridArea',
  'gridRow', 'gridRowEnd', 'gridRowSpan', 'gridRowStart', 'gridColumn', 'gridColumnEnd', 'gridColumnSpan', 'gridColumnStart', 'fontWeight',
  'lineClamp', 'lineHeight', 'opacity', 'order', 'orphans', 'scale', 'tabSize', 'widows', 'zIndex', 'zoom', 'fillOpacity', 'floodOpacity',
  'stopOpacity', 'strokeDasharray', 'strokeDashoffset', 'strokeMiterlimit', 'strokeOpacity', 'strokeWidth',
])
const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^(webkit|moz|ms)-/, '-$1-')

/** A style object as a style attribute's text. */
export function styleText(style: Style): string {
  let out = ''
  for (const key in style) {
    const v = style[key]
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') continue
    const custom = key.startsWith('--')
    const name = custom ? key : kebab(key)
    const value = typeof v === 'number' && v !== 0 && !custom && !UNITLESS.has(key) ? `${v}px` : String(v)
    out += `${out ? ';' : ''}${name}:${value}`
  }
  return out
}

// SVG presentation attributes React accepts in camelCase and writes dashed
const DASHED = new Set([
  'alignmentBaseline', 'baselineShift', 'clipPath', 'clipRule', 'colorInterpolation', 'colorInterpolationFilters', 'dominantBaseline',
  'fillOpacity', 'fillRule', 'floodColor', 'floodOpacity', 'fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'imageRendering',
  'letterSpacing', 'lightingColor', 'markerEnd', 'markerMid', 'markerStart', 'paintOrder', 'pointerEvents', 'shapeRendering', 'stopColor',
  'stopOpacity', 'strokeDasharray', 'strokeDashoffset', 'strokeLinecap', 'strokeLinejoin', 'strokeMiterlimit', 'strokeOpacity',
  'strokeWidth', 'textAnchor', 'textDecoration', 'textRendering', 'transformOrigin', 'vectorEffect', 'wordSpacing', 'writingMode',
])
// HTML attributes React spells differently from the markup
const RENAMED: Record<string, string> = {
  className: 'class', htmlFor: 'for', tabIndex: 'tabindex', readOnly: 'readonly', autoComplete: 'autocomplete', autoFocus: 'autofocus',
  spellCheck: 'spellcheck', contentEditable: 'contenteditable', colSpan: 'colspan', rowSpan: 'rowspan', maxLength: 'maxlength',
  minLength: 'minlength', crossOrigin: 'crossorigin', srcSet: 'srcset', encType: 'enctype', noValidate: 'novalidate', autoPlay: 'autoplay',
  playsInline: 'playsinline', allowFullScreen: 'allowfullscreen', dateTime: 'datetime', inputMode: 'inputmode', enterKeyHint: 'enterkeyhint',
  referrerPolicy: 'referrerpolicy', fetchPriority: 'fetchpriority', xlinkHref: 'xlink:href', xmlSpace: 'xml:space', xmlnsXlink: 'xmlns:xlink',
  defaultValue: 'value', defaultChecked: 'checked',
}
// Attributes whose presence is the value
const BOOLEAN = new Set(['hidden', 'disabled', 'checked', 'selected', 'readonly', 'multiple', 'open', 'inert', 'autofocus', 'autoplay', 'loop', 'muted', 'playsinline', 'novalidate', 'allowfullscreen', 'required', 'controls', 'default', 'reversed', 'async', 'defer', 'nomodule'])
// Elements with no closing tag
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])

function attrs(props: Props): string {
  let out = ''
  for (const key in props) {
    if (key === 'children' || key === 'key' || key === 'ref' || key === 'dangerouslySetInnerHTML') continue
    const v = props[key]
    // Event handlers have nothing to attach to in markup; a scene drives
    // itself from its script
    if (/^on[A-Z]/.test(key) || typeof v === 'function') continue
    if (v === null || v === undefined) continue
    if (key === 'style') {
      const text = typeof v === 'string' ? v : styleText(v as Style)
      if (text) out += ` style="${escape(text)}"`
      continue
    }
    const name = RENAMED[key] ?? (DASHED.has(key) ? kebab(key) : key)
    const data = name.startsWith('data-') || name.startsWith('aria-')
    if (typeof v === 'boolean') {
      if (data) out += ` ${name}="${v}"`
      else if (v && (BOOLEAN.has(name) || name === 'draggable' || name === 'spellcheck' || name === 'contenteditable')) out += BOOLEAN.has(name) ? ` ${name}` : ` ${name}="true"`
      else if (!v && (name === 'draggable' || name === 'spellcheck' || name === 'contenteditable')) out += ` ${name}="false"`
      continue
    }
    if (BOOLEAN.has(name)) {
      if (v) out += ` ${name}`
      continue
    }
    out += ` ${name}="${escape(String(v))}"`
  }
  return out
}

/** A keyed element carries its key into the markup, so the patcher keeps it with its own DOM node as siblings move, and replaces it when the key changes, as React remounts it. */
const KEY = 'data-ss-key'

export function jsx(type: string | Component<Props> | typeof Fragment, props: Props, key?: string | number): Html {
  if (type === Fragment) return new Html(html(props.children))
  if (typeof type === 'function') return type(key === undefined ? props : { ...props, key })
  const inner = props.dangerouslySetInnerHTML as { __html: string } | undefined
  const keyed = key === undefined ? '' : ` ${KEY}="${escape(String(key))}"`
  const open = `<${type}${keyed}${attrs(props)}>`
  if (VOID.has(type)) return new Html(open)
  return new Html(`${open}${inner ? inner.__html : html(props.children)}</${type}>`)
}
export const jsxs = jsx
export const jsxDEV = jsx

export function Fragment(props: { children?: Child }): Html {
  return new Html(html(props.children))
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace JSX {
  export type Element = Html
  export interface ElementChildrenAttribute {
    children: unknown
  }
  export interface IntrinsicAttributes {
    key?: string | number
  }
  export interface IntrinsicElements {
    [tag: string]: { children?: Child; style?: Style | string; key?: string | number; [attribute: string]: unknown }
  }
}
