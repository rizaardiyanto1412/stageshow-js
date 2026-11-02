import { html } from '../kit/jsx-runtime'
import { examples, groups } from './catalog'
import './viewer.css'

// The playground around an example: pick it, size it, play, pause, step and
// slow it. The example runs in an iframe on its own virtual clock (main.tsx);
// this page sends it controls and reads back its status.

type State = { name: string; phone: boolean; still: boolean; playing: boolean; speed: number; elapsed: number; ready: boolean; staticScene: boolean; error: string | null }

export function mount() {
  const params = new URLSearchParams(location.search)
  const initial = params.get('example')
  const s: State = {
    name: examples.some((e) => e.id === initial) ? initial! : examples[0].id,
    phone: false,
    still: matchMedia('(prefers-reduced-motion: reduce)').matches,
    playing: true,
    speed: 1,
    elapsed: 0,
    ready: false,
    staticScene: false,
    error: null,
  }
  let motionOverride = false
  let visible = false
  let lesson = params.get('lesson') ?? 'label'
  let annotation = params.get('annotation') ?? 'collect'

  const root = document.getElementById('root')!
  root.innerHTML = html(
    <main className="pg">
      <header className="pg-header"><a className="pg-brand" href="./">Stageshow</a><span className="pg-eyebrow">Playground</span></header>
      <div className="pg-picker">
        <label htmlFor="example-choice">Example</label>
        <select id="example-choice">
          {groups.map((group) => (
            <optgroup label={group}>{examples.filter((e) => e.group === group).map((e) => <option value={e.id}>{e.name}</option>)}</optgroup>
          ))}
        </select>
      </div>
      <section className="pg-preview" aria-label="Example preview">
        <div className="pg-toolbar">
          <div className="pg-segment" aria-label="Preview width"><button data-width="desktop">Desktop</button><button data-width="phone">Phone</button></div>
          <label className="pg-still"><input type="checkbox" />Reduced motion</label>
        </div>
        <div className="pg-canvas"><iframe /></div>
        <p role="alert" hidden />
        <div className="pg-transport">
          <div className="pg-buttons">
            <button className="pg-play">
              <svg className="pg-play-icon" viewBox="0 0 16 16" aria-hidden="true">
                <path className="pg-play-icon-left" />
                <path className="pg-play-icon-right" />
              </svg>
              <span className="pg-play-label" aria-hidden="true"><span className="pg-play-word">Play</span><span className="pg-pause-word">Pause</span></span>
            </button>
            <button data-step title="Advance one frame">Step</button>
            <button data-replay>Replay</button>
          </div>
          <div className="pg-time">
            <output aria-label="Current time" />
            <select aria-label="Playback speed">
              <option value="0.25">¼×</option><option value="0.5">½×</option><option value="1">1×</option><option value="2">2×</option>
            </select>
          </div>
        </div>
      </section>
      <section className="pg-caption"><div><h2 /><p /></div><code /></section>
      <footer className="pg-footer"><span /></footer>
    </main>,
  )
  const $ = <T extends Element>(sel: string) => root.querySelector<T>(sel)!
  const main = $<HTMLElement>('.pg')
  const picker = $<HTMLSelectElement>('#example-choice')
  const canvas = $<HTMLElement>('.pg-canvas')
  const stillBox = $<HTMLInputElement>('.pg-still input')
  const alert = $<HTMLParagraphElement>('.pg-preview > [role="alert"]')
  const play = $<HTMLButtonElement>('.pg-play')
  const step = $<HTMLButtonElement>('[data-step]')
  const speed = $<HTMLSelectElement>('.pg-time select')
  const time = $<HTMLOutputElement>('.pg-time output')
  let iframe = $<HTMLIFrameElement>('iframe')

  const send = (data: object) => iframe.contentWindow?.postMessage({ type: 'stageshow:control', ...data }, location.origin)
  const controls = () => send({ playing: s.playing && !s.still, speed: s.speed, visible })

  // Everything but the iframe, from state
  const paint = () => {
    const selected = examples.find((e) => e.id === s.name)!
    const disabled = !s.ready || s.still || s.staticScene
    main.toggleAttribute('data-reduced-motion', s.still)
    picker.value = s.name
    root.querySelectorAll<HTMLButtonElement>('[data-width]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.width === 'phone') === s.phone)))
    canvas.toggleAttribute('data-phone', s.phone)
    canvas.toggleAttribute('data-grid', selected.kind === 'Grid')
    stillBox.checked = s.still
    alert.hidden = !s.error
    alert.textContent = s.error ? `Preview stopped: ${s.error}. Check the console, fix the example, then select Replay.` : ''
    play.disabled = step.disabled = speed.disabled = disabled
    play.toggleAttribute('data-playing', s.playing)
    play.setAttribute('aria-label', s.playing ? 'Pause' : 'Play')
    const [left, right] = Array.from(play.querySelectorAll('path'))
    left.setAttribute('d', s.playing ? 'M4 3L6.5 3L6.5 13L4 13Z' : 'M5 3L9 5.5L9 10.5L5 13Z')
    right.setAttribute('d', s.playing ? 'M9.5 3L12 3L12 13L9.5 13Z' : 'M9 5.5L13 8L13 8L9 10.5Z')
    speed.value = String(s.speed)
    time.innerHTML = `${((s.still || s.staticScene ? 0 : s.elapsed) / 1000).toFixed(2)}<span>s</span>`
    $('.pg-caption h2').textContent = selected.name
    $('.pg-caption p').textContent = selected.note
    $('.pg-caption code').textContent = s.name === 'contrasts' ? 'teaching/contrasts.tsx' : `examples/${s.name}/`
    $('.pg-footer span').textContent = s.still ? 'The reduced-motion poster is shown.' : s.staticScene ? 'This example is static.' : 'Pause playback to step through individual frames.'
  }

  // A fresh iframe for the example: on a new pick, a replay, or a motion switch
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    send({ visible })
  })
  const load = () => {
    Object.assign(s, { ready: false, staticScene: false, elapsed: 0, error: null })
    const url = new URL(location.href)
    url.searchParams.set('example', s.name)
    history.replaceState(null, '', url)
    const next = document.createElement('iframe')
    next.title = examples.find((e) => e.id === s.name)!.name
    next.style.height = iframe.style.height || '460px'
    next.src = `?embed=${s.name}&still=${s.still ? 1 : 0}${s.name === 'contrasts' ? `&lesson=${encodeURIComponent(lesson)}` : s.name === 'annotations' ? `&annotation=${encodeURIComponent(annotation)}` : ''}`
    next.addEventListener('load', controls)
    observer.disconnect()
    iframe.replaceWith(next)
    iframe = next
    observer.observe(iframe)
    paint()
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== iframe.contentWindow || event.data?.type !== 'stageshow:status') return
    const d = event.data
    const remember = (key: string, value: string) => {
      const url = new URL(location.href)
      url.searchParams.set(key, value)
      history.replaceState(null, '', url)
    }
    if (typeof d.lesson === 'string') remember('lesson', (lesson = d.lesson))
    if (typeof d.annotation === 'string') remember('annotation', (annotation = d.annotation))
    if (Number.isFinite(d.elapsed)) s.elapsed = d.elapsed
    if (typeof d.staticScene === 'boolean') s.staticScene = d.staticScene
    if (Number.isFinite(d.height)) iframe.style.height = `${Math.max(1, d.height)}px`
    if (d.error) Object.assign(s, { error: String(d.error), ready: false, playing: false })
    else if (d.ready) {
      s.ready = true
      controls()
    }
    paint()
  })
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
    if (motionOverride) return
    s.still = e.matches
    load()
  })
  picker.addEventListener('change', () => {
    s.name = picker.value
    load()
  })
  root.querySelectorAll<HTMLButtonElement>('[data-width]').forEach((b) =>
    b.addEventListener('click', () => {
      s.phone = b.dataset.width === 'phone'
      paint()
    }),
  )
  stillBox.addEventListener('change', () => {
    motionOverride = true
    s.still = stillBox.checked
    load()
  })
  play.addEventListener('click', () => {
    s.playing = !s.playing
    controls()
    paint()
  })
  step.addEventListener('click', () => {
    s.playing = false
    send({ step: true })
    paint()
  })
  $('[data-replay]').addEventListener('click', load)
  speed.addEventListener('change', () => {
    s.speed = Number(speed.value)
    controls()
    paint()
  })
  load()
}
