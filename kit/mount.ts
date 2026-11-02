import type { Child } from './jsx-runtime'
import { attach, behaviorOf, dropBehavior, patch, syncBehaviors } from './render'
import { collect, StageRun, type StageProps } from './stage'

// Each mounted host's render, for refresh()
const pages = new WeakMap<Element, () => void>()

/**
 * Render the page around `el` again, now: the scene a mount() is showing,
 * nearest first. For a page with state of its own (a lesson picker, a tab
 * strip outside any stage), kept by the scene's module and changed by a
 * behavior's listener. Running stages take their new props and keep playing.
 */
export function refresh(el: Element) {
  const host = el.closest('[data-ss-mount]')
  if (host) pages.get(host)?.()
}

/** The host's size, handed to a scene that lays itself out from it. Absent in a server render or an export's first frame. */
export type Box = { width: number; height: number }

/**
 * Bring a scene to life in `host`: every Stage in it fits its box, renders
 * its state and plays its script while on screen. If the host already holds
 * the scene's markup (an export, or a server render of the same scene), the
 * stages take it over where it is; otherwise the scene is rendered into the
 * host first.
 *
 * The scene gets the host's size and renders again when it changes, so a
 * page of stages can size each one from its slot (a bento tile, a grid
 * cell). Stages already running take their new props and keep playing.
 * Parts with behaviors outside any stage (a Count in page text) work too.
 * Returns a function that stops every stage and lets go.
 */
export function mount(host: Element, scene: (box?: Box) => Child): () => void {
  const runs = new Map<Element, StageRun<object>>()
  const parts = new Set<Element>()
  const box = (): Box => ({ width: host.clientWidth, height: host.clientHeight })
  let size = ''
  // Its own: not inside a stage, and not inside another mount nested in this one
  const own = (el: Element) => el.parentElement?.closest('[data-ss-mount]') === host && !el.parentElement?.closest('.ss-stage')
  // A mount can sit inside another's scene (a pair a behavior mounts in a
  // page). The outer page's renders leave this host's children to it
  host.setAttribute('data-ss-mount', '')
  const outer = behaviorOf(host)
  attach(host, {
    morph(next) {
      outer?.morph?.(next)
      next.setAttribute('data-ss-mount', '')
      return false
    },
    update: () => outer?.update?.(),
    destroy: () => outer?.destroy?.(),
  })

  const render = (first: boolean) => {
    const b = box()
    size = `${b.width}x${b.height}`
    const out = collect(() => scene(b))
    const stages: StageProps<object>[] = out.stages
    if (!first || !host.querySelector('[data-ss-stage]')) patch(host, out.markup)
    // Stages: new ones start, running ones take their props, gone ones stop
    const seen = new Set<Element>()
    host.querySelectorAll<HTMLDivElement>('[data-ss-stage]').forEach((fit) => {
      if (!own(fit)) return
      seen.add(fit)
      const i = Number(fit.dataset.ssStage)
      const run = runs.get(fit)
      if (run) return run.setProps(stages[i])
      const fresh = new StageRun(fit, stages[i], i)
      runs.set(fit, fresh)
      // The page's next render reaches this element: the stage keeps its own
      // inside and the box it sized (it takes that render's props below)
      attach(fit, {
        morph(next) {
          next.setAttribute('style', fit.getAttribute('style') ?? '')
          return false
        },
      })
    })
    for (const [fit, run] of runs)
      if (!seen.has(fit)) {
        run.destroy()
        dropBehavior(fit)
        runs.delete(fit)
      }
    syncBehaviors(host, parts, (el) => !own(el))
  }

  render(true)
  pages.set(host, () => render(false))
  // Rendered again only when the host's size changes; a render that changes
  // nothing on the page costs one string and a walk
  const ro = new ResizeObserver(() => {
    const b = box()
    if (`${b.width}x${b.height}` !== size) render(false)
  })
  ro.observe(host)
  return () => {
    ro.disconnect()
    pages.delete(host)
    runs.forEach((run, fit) => {
      run.destroy()
      dropBehavior(fit)
    })
    parts.forEach(dropBehavior)
    if (outer) attach(host, outer)
    else dropBehavior(host)
    host.removeAttribute('data-ss-mount')
  }
}
