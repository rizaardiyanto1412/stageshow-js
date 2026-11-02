import type { Child } from '../jsx-runtime'
import { behavior, hold, mark, reduced as reducedMotion } from '../render'
import type { Rect } from '../measure'
import { css, type Bezier, type EaseName } from '../ease'
import './Camera.css'

/**
 * Moves the view in on part of the scene and back out, pushing in on a
 * detail. Wrap the scene in it and set `focus` to a rect in
 * stage pixels, measured with `a.rect(name, { layout: true })` (the layout
 * rect, so the zoom itself never feeds back in); null shows everything. The
 * view never leaves the scene's edges. Keep the cursor still while the camera
 * moves, or put it where it is going only once it has settled. The view is
 * its own frame: zoomed in, its edges feather so the scene passes under a
 * soft edge instead of running hard into the stage's (`feather`, in px).
 * Everything inside moves with the zoom, and `a.rect()` of a target inside
 * reports where it is on screen now; give the cursor's rest point in stage
 * pixels, outside the Camera, or it lands somewhere else once zoomed.
 * `ease` takes a named curve from kit/ease.ts ('house' for a video-paced move).
 */
export function Camera({ focus, pad = 32, max = 2, duration = 1100, feather = 28, ease: curve = 'camera', children, className }: { focus: Rect | null; pad?: number; max?: number; duration?: number; feather?: number; ease?: EaseName | Bezier; children: Child; className?: string }) {
  behavior('camera', filming)
  const ease = `${reducedMotion() ? 0 : duration}ms ${css(curve)}`
  return (
    <div
      className="ss-camera-view"
      data-ss-part="camera"
      data-aim={focus ? `${focus.x},${focus.y},${focus.width},${focus.height}` : undefined}
      data-pad={pad}
      data-max={max}
      data-feather={feather}
      style={{ '--ss-feather': '0px', transition: `--ss-feather ${ease}` }}
    >
      <div className={`ss-camera${className ? ` ${className}` : ''}`} style={{ transform: 'none', transition: `transform ${ease}` }}>
        {children}
      </div>
    </div>
  )
}

// The zoom is worked out in the frame around the view, and followed, not
// read once: a Stage switching to its compact design (or any resize) changes it
function filming(view: HTMLElement) {
  const frame = view.parentElement
  let size = { w: 0, h: 0 }
  const aim = () => {
    const camera = view.firstElementChild as HTMLElement | null
    const a = view.dataset.aim?.split(',').map(Number)
    const focus = a ? { x: a[0], y: a[1], width: a[2], height: a[3] } : null
    const pad = Number(view.dataset.pad)
    const max = Number(view.dataset.max)
    const feather = Number(view.dataset.feather)
    let transform = 'none'
    if (focus && size.w) {
      const s = Math.max(1, Math.min(max, size.w / (focus.width + pad * 2), size.h / (focus.height + pad * 2)))
      const tx = Math.min(0, Math.max(size.w - size.w * s, size.w / 2 - (focus.x + focus.width / 2) * s))
      const ty = Math.min(0, Math.max(size.h - size.h * s, size.h / 2 - (focus.y + focus.height / 2) * s))
      transform = `translate(${tx}px, ${ty}px) scale(${s})`
    }
    const zoomed = transform !== 'none'
    mark(view, 'data-zoomed', zoomed && 'true')
    mark(view, 'data-focus', zoomed && focus ? `${focus.x},${focus.y},${focus.width},${focus.height}` : null)
    hold(view, '--ss-feather', `${zoomed ? feather : 0}px`)
    hold(camera, 'transform', transform)
  }
  const read = () => {
    if (!frame || (size.w === frame.offsetWidth && size.h === frame.offsetHeight)) return
    size = { w: frame.offsetWidth, h: frame.offsetHeight }
    aim()
  }
  const ro = new ResizeObserver(read)
  if (frame) ro.observe(frame)
  read()
  return {
    update: aim,
    destroy: () => ro.disconnect(),
  }
}
