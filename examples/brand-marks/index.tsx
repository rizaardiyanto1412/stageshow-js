import { BrandMark, Stage, brandMarks, mount, type BrandName, type Child } from '../../kit'
import './brands.css'

const names = Object.keys(brandMarks) as BrandName[]
const groups = ['Payments', 'Banks', 'Apps', 'Crypto'] as const

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

function Sheet({ theme }: { theme: 'light' | 'dark' }) {
  const id = `bm-frame-${theme}`
  measured(id, width => <SheetStage theme={theme} width={width} />)
  return <section className="bm-sheet">
    <h2>{theme === 'light' ? 'Light' : 'Dark'}</h2>
    <div id={id} className="bm-frame" />
  </section>
}

function SheetStage({ theme, width }: { theme: 'light' | 'dark'; width: number }) {
  const columns = width >= 600 ? 6 : 3
  const padding = width >= 600 ? 24 : 16
  const gridHeight = groups.reduce((total, group) => {
    const rows = Math.ceil(names.filter(name => brandMarks[name].category === group).length / columns)
    return total + rows * 82 + (rows - 1) * 20
  }, 0)
  const height = padding * 2 + (groups.length - 1) * 28 + groups.length * 36 + gridHeight
  return <Stage specimen width={width} height={height} theme={theme} greys="cool" className="bm-stage">
    {() => <div className="bm-content" style={{ padding }}>
      {groups.map(group => <section className="bm-group" key={group}>
        <h3>{group}</h3>
        <div className="bm-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {names.filter(name => brandMarks[name].category === group).map(brand => <div className="bm-item" key={brand}>
            <BrandMark brand={brand} size={40} />
            <span>{brandMarks[brand].name}</span>
          </div>)}
        </div>
      </section>)}
    </div>}
  </Stage>
}

export default function BrandMarks() {
  return <div className="bm-gallery"><Sheet theme="light" /><Sheet theme="dark" /></div>
}
