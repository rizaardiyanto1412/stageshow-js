import type { Child } from './jsx-runtime'
import { collect, StageRun } from './stage'

/**
 * Bring a scene to life in `host`: every Stage in it fits its box, renders
 * its state and plays its script while on screen. If the host already holds
 * the scene's markup (an export, or a server render of the same scene), the
 * stages take it over where it is; otherwise the scene is rendered into the
 * host first. Returns a function that stops every stage and lets go.
 */
export function mount(host: Element, scene: () => Child): () => void {
  const { markup, stages } = collect(scene)
  if (!host.querySelector('[data-ss-stage]')) host.innerHTML = markup
  const runs = Array.from(host.querySelectorAll<HTMLDivElement>('[data-ss-stage]')).map((fit) => {
    const i = Number(fit.dataset.ssStage)
    return new StageRun(fit, stages[i], i)
  })
  return () => runs.forEach((run) => run.destroy())
}
