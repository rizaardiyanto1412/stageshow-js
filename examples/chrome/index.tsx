import { Icon, Prompt, Stage, Window, mount, type Child, type WindowProps } from '../../kit'
import './chrome.css'

// One native-size figure per option. The page reflows; the chrome does not
// shrink as part of a large sheet. All frame measurements come from Window.
const files = [{ name: 'Brief.pdf', size: '24 KB' }, { name: 'Notes.md', size: '4 KB' }, { name: 'Sketch.fig', size: '86 KB' }, { name: 'Assets.zip', size: '2 MB' }]
function Content({ short = false }: { short?: boolean }) {
  return <div className="wc-content" aria-label="Files">{files.slice(0, short ? 3 : 4).map((file, i) => <div className="wc-file-row" key={file.name} data-selected={i === 0 || undefined}><Icon name="file" size={14} /><span>{file.name}</span><span className="wc-file-size">{file.size}</span></div>)}</div>
}

function Tool() {
  return <span className="wc-tools"><Icon name="search" size={14} /><Icon name="plus" size={14} /></span>
}

function TallTool() {
  return <span className="wc-tall-tool"><span className="wc-tall-tool__icon"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2.5 6V4.5h5L9 6h8.5v10h-15ZM10 9v4M8 11h4" /></svg></span><span>New folder</span></span>
}

function Side() {
  return <div className="wc-side"><span data-active>All files</span><span>Shared</span><span>Archive</span></div>
}

type Specimen = { id: string; title: string; note: string; props: WindowProps; cool?: boolean }
const specimens: Specimen[] = [
  { id: 'glass', title: 'Glass', note: 'Frosted frame and inset page.', props: { chrome: 'glass', url: 'files.example' } },
  { id: 'card', title: 'Card', note: 'Pale address field and a soft lifted edge.', props: { chrome: 'card', url: 'files.example' } },
  { id: 'hairline', title: 'Hairline', note: 'A short bar with a fine separator.', props: { chrome: 'hairline', url: <span className="wc-address">files.example</span> } },
  { id: 'terminal', title: 'Terminal', note: 'One dark surface, without a bar divider.', props: { chrome: 'terminal', title: 'workspace — zsh', lights: 'grey' } },
  { id: 'browser', title: 'Browser', note: 'Native address bar.', props: { url: 'files.example' } },
  { id: 'tabs', title: 'Browser with tabs', note: 'Tabs and back/forward controls.', props: { url: 'files.example', nav: true, tabs: ['Files', 'Docs'] } },
  { id: 'app', title: 'App toolbar', note: 'Title and controls in one bar.', props: { title: 'Files', toolbar: <Tool /> } },
  { id: 'sidebar', title: 'Sidebar', note: 'Lights in a full-height sidebar.', props: { title: 'Files', toolbar: <Tool />, sidebarWidth: 96, sidebar: <Side /> } },
  { id: 'large-lights', title: 'Larger lights', note: 'The native 12px traffic lights.', cool: true, props: { title: 'Files', toolbar: <Tool />, lightsSize: 'large' } },
  { id: 'floating-sidebar', title: 'Floating sidebar', note: 'An inset panel with nested corners.', cool: true, props: { title: 'Files', toolbar: <Tool />, sidebarWidth: 96, sidebarStyle: 'floating', sidebar: <Side /> } },
  { id: 'tall-toolbar', title: 'Tall toolbar', note: 'A taller bar with inline controls and larger lights.', cool: true, props: { title: 'Files', toolbar: <TallTool />, lightsSize: 'large', barSize: 'tall' } },
  { id: 'combined', title: 'Combined', note: 'Floating sidebar, tall bar and larger lights.', cool: true, props: { title: 'Files', toolbar: <TallTool />, sidebarWidth: 96, sidebarStyle: 'floating', sidebar: <Side />, lightsSize: 'large', barSize: 'tall' } },
]

// The stage takes its width from the column it sits in. A render can't
// measure, so the column renders empty and the stage mounts into it once it
// is on the page, and again whenever its width changes.
function measured(id: string, scene: (width: number) => Child) {
  if (typeof document === 'undefined') return
  queueMicrotask(() => {
    const host = document.getElementById(id)
    if (!host) return
    let width = 0, stop = () => {}
    const measure = () => {
      if (!host.isConnected) return void (observer.disconnect(), stop())
      if (!host.clientWidth || host.clientWidth === width) return
      width = host.clientWidth
      stop()
      host.replaceChildren()
      stop = mount(host, () => scene(width))
    }
    const observer = new ResizeObserver(measure)
    measure()
    observer.observe(host)
  })
}

function Figure({ item }: { item: Specimen }) {
  const id = `wc-picture-${item.id}`
  measured(id, width =>
    <Stage specimen width={width} height={224} greys={item.cool ? 'cool' : undefined}>
      {() => <div className="wc-ground" data-material={item.id}>
        <Window {...item.props} className="wc-window" style={{ width: width - 32, height: 176 }}>
          {item.id === 'terminal' ? <div className="wc-terminal"><Prompt>pwd</Prompt><span>/workspace</span></div> : <Content short={Boolean(item.props.tabs)} />}
        </Window>
      </div>}
    </Stage>)
  return <figure className="wc-figure" data-specimen={item.id}>
    <div id={id} className="wc-picture" />
    <figcaption><strong>{item.title}</strong><span>{item.note}</span></figcaption>
  </figure>
}

export default function Chrome() {
  return <div className="wc-gallery">{specimens.map(item => <Figure key={item.id} item={item} />)}</div>
}
