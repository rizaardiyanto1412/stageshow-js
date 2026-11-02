import { mount as mountScene } from '../kit/mount'
import type { Child } from '../kit/jsx-runtime'
import './preview.css'

const modules = import.meta.glob<{ default: () => Child }>('../examples/*/index.tsx')

export async function mount(name: string, still: boolean, onError: (message: string) => void = () => {}) {
  const load = name === 'contrasts' ? () => import('../teaching/contrasts') : modules[`../examples/${name}/index.tsx`]
  if (!load) throw new Error(`Unknown example: ${name}`)
  const { default: Demo } = await load()
  const w = window as unknown as { __stageshow?: { still?: boolean } }
  if (still) w.__stageshow = { ...w.__stageshow, still: true }
  const example = document.createElement('div')
  example.id = 'example'
  document.getElementById('root')!.replaceChildren(example)
  try {
    mountScene(example, Demo)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const p = document.createElement('p')
    p.setAttribute('role', 'alert')
    p.textContent = `This example could not render: ${message}. Check the console for details, then replay after fixing it.`
    example.replaceChildren(p)
    onError(message)
  }
}
