#!/usr/bin/env node
// Export a scene as one block of HTML, CSS and JS that can be pasted into any
// page: a WordPress Custom HTML block, a Webflow embed, a static site, a
// Svelte or Vue component's markup. Nothing to install on the host.
//
//   node scripts/export.mjs <example id | path to a scene .tsx> [--out file.html]
//
// What it writes:
//   <stageshow-scene>                  a host element, isolated in a shadow root,
//     <template shadowrootmode="open">   so the page's CSS can't reach the scene
//       <style>only the kit CSS this scene uses, minified</style>
//       the first frame, rendered here: visible before (and without) the script
//     </template>
//   </stageshow-scene>
//   <script>the engine and this scene's script, minified; takes the frame over</script>
//
// The first frame is the wide design at the scene's initial state; the
// script switches to the compact design in a narrow column at once.
import { build, transform } from 'esbuild'
import postcss from 'postcss'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const kit = join(root, 'kit')

function parseArgs(argv) {
  const out = { scene: null, out: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--out') out.out = argv[++i]
    else if (a === '-h' || a === '--help') out.help = true
    else out.scene = a
  }
  return out
}

function sceneFile(arg) {
  const byId = join(root, 'examples', arg, 'index.tsx')
  if (existsSync(byId)) return byId
  const path = resolve(arg)
  if (existsSync(path)) return path
  throw new Error(`No scene at ${arg}: give an example id (examples/<id>/index.tsx) or a path to a .tsx file`)
}

// Scenes import the kit by relative path or as stageshow-js; JSX renders to strings
const common = (file) => ({
  bundle: true,
  write: false,
  jsx: 'automatic',
  jsxImportSource: 'stageshow-js',
  alias: { 'stageshow-js': kit },
  loader: { '.jpg': 'dataurl', '.jpeg': 'dataurl', '.png': 'dataurl', '.webp': 'dataurl', '.gif': 'dataurl', '.svg': 'text', '.woff2': 'dataurl' },
  absWorkingDir: root,
  logLevel: 'silent',
  define: { 'process.env.NODE_ENV': '"production"' },
  // Site paths in CSS (url(/images/...)) point at the host page's own files
  plugins: [{ name: 'site-paths', setup: (b) => b.onResolve({ filter: /^\//, namespace: 'file' }, (a) => (a.kind === 'url-token' || a.kind === 'import-rule' ? { path: a.path, external: true } : undefined)) }],
  stdin: undefined,
  entryPoints: [file],
})

// The first frame: the scene rendered in Node, exactly as the page's script
// will render it before taking over
async function firstFrame(file) {
  const dir = mkdtempSync(join(tmpdir(), 'stageshow-export-'))
  try {
    const entry = join(dir, 'entry.tsx')
    writeFileSync(entry, `import Scene from ${JSON.stringify(file)}\nimport { collect } from ${JSON.stringify(join(kit, 'stage'))}\nexport const markup = collect(Scene).markup\n`)
    const result = await build({ ...common(entry), platform: 'node', format: 'esm', outfile: join(dir, 'frame.mjs'), write: true, loader: { ...common(entry).loader, '.css': 'empty' } })
    if (result.errors.length) throw new Error(result.errors.map((e) => e.text).join('\n'))
    const { markup } = await import(pathToFileURL(join(dir, 'frame.mjs')).href)
    return markup
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// The page's script and the CSS its parts import, both minified. Only the
// parts the scene reaches are bundled, and only their CSS comes with them.
async function client(file) {
  const dir = mkdtempSync(join(tmpdir(), 'stageshow-export-'))
  try {
    const entry = join(dir, 'entry.tsx')
    writeFileSync(
      entry,
      `import Scene from ${JSON.stringify(file)}
import { mount } from ${JSON.stringify(join(kit, 'mount'))}
const host = document.currentScript.previousElementSibling
// A host added by script (innerHTML) doesn't attach its declarative shadow root: attach it here
if (!host.shadowRoot) {
  const t = host.querySelector(':scope > template')
  host.attachShadow({ mode: 'open' }).append(t.content)
  t.remove()
}
mount(host.shadowRoot.querySelector('.ss-host'), Scene)
`,
    )
    const result = await build({ ...common(entry), platform: 'browser', format: 'iife', target: 'es2022', minify: true, outdir: dir, entryNames: 'scene', treeShaking: true })
    if (result.errors.length) throw new Error(result.errors.map((e) => e.text).join('\n'))
    const js = result.outputFiles.find((f) => f.path.endsWith('.js'))?.text ?? ''
    const css = result.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? ''
    return { js, css }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// esbuild keeps the CSS of every kit file the scene's imports reach, even
// the parts it then drops from the script. A kit rule is kept only if every
// kit class it names (ss-...) appears in the scene's markup or script; then
// keyframes nothing animates with go too.
async function prune(css, used) {
  const tree = postcss.parse(css)
  const known = (sel) => (sel.match(/\.ss-[\w-]+/g) ?? []).every((c) => used.has(c.slice(1)))
  tree.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes/i.test(rule.parent.name)) return
    const keep = rule.selectors.filter(known)
    if (!keep.length) rule.remove()
    else if (keep.length !== rule.selectors.length) rule.selectors = keep
  })
  const animated = new Set()
  tree.walkDecls(/^animation(-name)?$/, (d) => d.value.split(/[\s,]+/).forEach((w) => animated.add(w)))
  tree.walkAtRules(/keyframes$/i, (at) => {
    if (!animated.has(at.params.trim())) at.remove()
  })
  // Registered properties nothing reads or sets any more
  const text = tree.toString()
  tree.walkAtRules(/^property$/i, (at) => {
    const name = at.params.trim()
    if (text.split(name).length - 1 <= 1) at.remove()
  })
  // Blocks left empty
  for (let again = true; again; ) {
    again = false
    tree.walkAtRules((at) => {
      if (at.nodes && !at.nodes.length && !/^(property|font-face)$/i.test(at.name)) {
        at.remove()
        again = true
      }
    })
  }
  return (await transform(tree.toString(), { loader: 'css', minify: true })).code
}

// @property only registers from the document, never from a shadow root: those
// rules go in a light-DOM style beside the host
function splitProperties(css) {
  const props = []
  const rest = css.replace(/@property\s+[^{]+\{[^}]*\}/g, (m) => (props.push(m), ''))
  return { props: props.join(''), rest }
}

export async function exportScene(arg) {
  const file = sceneFile(arg)
  const [markup, { js, css: all }] = await Promise.all([firstFrame(file), client(file)])
  const used = new Set([...(markup + js).matchAll(/ss-[\w-]+/g)].map((m) => m[0]))
  const css = await prune(all, used)
  const { props, rest } = splitProperties(css)
  // The host's own type, color and line height stop at the scene's edge
  const reset = ':host{all:initial;display:block;contain:layout}.ss-host{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}'
  const safeJs = js.replace(/<\/script/gi, '<\\/script')
  return (
    `<!-- Stageshow scene: ${relative(root, file)}. Exported by stageshow-js; paste as is. -->\n` +
    (props ? `<style>${props}</style>\n` : '') +
    `<stageshow-scene style="display:block"><template shadowrootmode="open"><style>${reset}${rest.trim()}</style><div class="ss-host">${markup}</div></template></stageshow-scene>\n` +
    `<script>${safeJs.trim()}</script>\n`
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.scene) {
    console.log('Usage: node scripts/export.mjs <example id | path to scene.tsx> [--out file.html]')
    process.exitCode = args.help ? 0 : 1
    return
  }
  const snippet = await exportScene(args.scene)
  const out = args.out ?? `${basename(args.scene).replace(/\.tsx$/, '') === 'index' ? basename(dirname(resolve(args.scene))) : basename(args.scene).replace(/\.tsx$/, '')}.html`
  writeFileSync(out, snippet)
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`
  const { gzipSync } = await import('node:zlib')
  console.log(`${out}: ${kb(snippet.length)} (${kb(gzipSync(snippet).length)} gzipped)`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => {
  console.error(`export: ${e.message}`)
  process.exitCode = 1
})
