#!/usr/bin/env node
// Export scenes as HTML, CSS and JS that work in any page: a WordPress Custom
// HTML block, a Webflow embed, a static site, or a React, Svelte or Vue app.
// Nothing to install on the host.
//
//   stageshow-export <scene> [--out file.html]
//   stageshow-export <scene>... --outdir dir [--base /scenes/]
//
// A scene is an example id (examples/<id>/index.tsx) or a path to a .tsx file.
//
// One scene, the default: one block to paste.
//   <stageshow-scene>                  a host element, isolated in a shadow root,
//     <template shadowrootmode="open">   so the page's CSS can't reach the scene
//       <style>only the kit CSS this scene uses, minified</style>
//       the first frame, rendered here: visible before (and without) the script
//     </template>
//   </stageshow-scene>
//   <script>the engine and this scene's script, minified; takes the frame over</script>
//
// Several scenes on one page (--outdir): the engine and the CSS are shared,
// not repeated. For each scene, <name>.html (the host element and first
// frame, no script) and <name>.js (an ES module: `export default (host) =>
// stop`); shared stageshow-*.js chunks the modules import; and stageshow.css,
// every scene's CSS once, which each host links from its shadow root at
// `--base` (the URL the folder is served from, ./ by default). Put the HTML in
// the page (a server render, a template), preload the stylesheet in the
// page's head so the first frame is styled when it paints, and load the
// module when the scene nears the screen:
//   <link rel="preload" href="/scenes/stageshow.css" as="style">
//   const { default: play } = await import('/scenes/hero.js')
//   const stop = play(document.querySelector('#hero stageshow-scene'))
//
// The first frame is the wide design at the scene's initial state; the
// script switches to the compact design in a narrow column at once.
import { build, transform } from 'esbuild'
import postcss from 'postcss'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MIME = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif' }
const kit = join(root, 'kit')

function parseArgs(argv) {
  const out = { scenes: [], out: null, outdir: null, base: './' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--out') out.out = argv[++i]
    else if (a === '--outdir') out.outdir = argv[++i]
    else if (a === '--base') out.base = argv[++i]
    else if (a === '-h' || a === '--help') out.help = true
    else out.scenes.push(a)
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

const nameOf = (arg) => {
  const base = basename(arg).replace(/\.tsx$/, '')
  return base === 'index' ? basename(dirname(resolve(arg))) : base
}

// Scenes import the kit by relative path or as stageshow-js; JSX renders to strings
const options = {
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
  plugins: [
    { name: 'site-paths', setup: (b) => b.onResolve({ filter: /^\//, namespace: 'file' }, (a) => (a.kind === 'url-token' || a.kind === 'import-rule' ? { path: a.path, external: true } : undefined)) },
    // new URL('./mark.svg', import.meta.url), as Vite resolves it: inlined as a
    // data URL, so the asset travels with the export and the server render
    // never writes a path from the build machine
    {
      name: 'url-assets',
      setup: (b) =>
        b.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, (a) => {
          if (a.path.includes('node_modules')) return undefined
          const text = readFileSync(a.path, 'utf8')
          if (!text.includes('import.meta.url')) return undefined
          const contents = text.replace(/new URL\((['"])(\.{1,2}\/[^'"]+)\1,\s*import\.meta\.url\)/g, (_, q, rel) => {
            const file = resolve(dirname(a.path), rel)
            const mime = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream'
            // Text stays text (SVG compresses far better unencoded); the rest is base64
            const data = mime === 'image/svg+xml' ? `data:${mime},${encodeURIComponent(readFileSync(file, 'utf8'))}` : `data:${mime};base64,${readFileSync(file).toString('base64')}`
            return `new URL(${JSON.stringify(data)})`
          })
          return { contents, loader: extname(a.path).replace(/^\.[cm]?/, '').replace(/^\./, '') || 'js', resolveDir: dirname(a.path) }
        }),
    },
  ],
}

async function inTemp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'stageshow-export-'))
  try {
    return await fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const failed = (result) => {
  if (result.errors.length) throw new Error(result.errors.map((e) => e.text).join('\n'))
}

// The first frame: the scene rendered in Node, exactly as the page's script
// will render it before taking over
const firstFrame = (file) =>
  inTemp(async (dir) => {
    const entry = join(dir, 'entry.tsx')
    writeFileSync(entry, `import Scene from ${JSON.stringify(file)}\nimport { collect } from ${JSON.stringify(join(kit, 'stage'))}\nexport const markup = collect(Scene).markup\n`)
    const out = join(dir, 'frame.mjs')
    failed(await build({ ...options, entryPoints: [entry], platform: 'node', format: 'esm', outfile: out, write: true, loader: { ...options.loader, '.css': 'empty' } }))
    return (await import(pathToFileURL(out).href)).markup
  })

// Takes the host element over: attaches its shadow root if the page added it
// by script (innerHTML doesn't attach declarative shadow roots), then mounts
const TAKE_OVER = `
function take(host) {
  if (!host.shadowRoot) {
    const t = host.querySelector(':scope > template')
    host.attachShadow({ mode: 'open' }).append(t.content)
    t.remove()
  }
  return mount(host.shadowRoot.querySelector('.ss-host'), Scene)
}
`
const entryFor = (file, tail) => `import Scene from ${JSON.stringify(file)}\nimport { mount } from ${JSON.stringify(join(kit, 'mount'))}\n${TAKE_OVER}${tail}`

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
    if (text.split(at.params.trim()).length - 1 <= 1) at.remove()
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

// The host element with the first frame and the scene's CSS. @property only
// registers from the document, never from a shadow root: those rules go in a
// light-DOM style beside the host.
// The host's own type, color and line height stop at the scene's edge
const RESET = ':host{all:initial;display:block;contain:layout}.ss-host{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}'

// A scene's CSS, pruned to what it uses, split into what goes in the shadow
// root and the @property rules that go beside it
async function sceneCss(markup, css, js) {
  const used = new Set([...(markup + js).matchAll(/ss-[\w-]+/g)].map((m) => m[0]))
  const props = []
  const rest = (await prune(css, used)).replace(/@property\s+[^{]+\{[^}]*\}/g, (m) => (props.push(m), ''))
  return { props: props.join(''), rest: rest.trim() }
}

// The host element with the first frame, its styles inside (`style`, CSS or
// a stylesheet link), and @property rules beside it
const hostHtml = (file, markup, style, props) =>
  `<!-- Stageshow scene: ${relative(root, file)}. Exported by stageshow-js. -->\n` +
  (props ? `<style>${props}</style>\n` : '') +
  `<stageshow-scene style="display:block"><template shadowrootmode="open">${style}<div class="ss-host">${markup}</div></template></stageshow-scene>\n`

/** One scene as one block to paste: host, first frame, CSS and an inline script. */
export async function exportScene(arg) {
  const file = sceneFile(arg)
  const [markup, { js, css }] = await Promise.all([
    firstFrame(file),
    inTemp(async (dir) => {
      const entry = join(dir, 'entry.ts')
      writeFileSync(entry, entryFor(file, 'take(document.currentScript.previousElementSibling)\n'))
      const result = await build({ ...options, entryPoints: [entry], platform: 'browser', format: 'iife', target: 'es2022', minify: true, outdir: dir, entryNames: 'scene' })
      failed(result)
      return { js: result.outputFiles.find((f) => f.path.endsWith('.js'))?.text ?? '', css: result.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '' }
    }),
  ])
  const { props, rest } = await sceneCss(markup, css, js)
  return `${hostHtml(file, markup, `<style>${RESET}${rest}</style>`, props)}<script>${js.replace(/<\/script/gi, '<\\/script').trim()}</script>\n`
}

/** Several scenes for one page: per scene an HTML host and an ES module, sharing the engine's chunks. */
export async function exportScenes(args, outdir, base = './') {
  const scenes = args.map((arg) => ({ name: nameOf(arg), file: sceneFile(arg) }))
  const names = new Set(scenes.map((s) => s.name))
  if (names.size !== scenes.length) throw new Error('Two scenes would share a file name; rename one')
  mkdirSync(outdir, { recursive: true })
  const frames = await Promise.all(scenes.map((s) => firstFrame(s.file)))
  const outputs = await inTemp(async (dir) => {
    for (const s of scenes) writeFileSync(join(dir, `${s.name}.ts`), entryFor(s.file, 'export default take\n'))
    const result = await build({
      ...options,
      entryPoints: scenes.map((s) => join(dir, `${s.name}.ts`)),
      platform: 'browser',
      format: 'esm',
      splitting: true,
      target: 'es2022',
      minify: true,
      outdir: dir,
      entryNames: '[name]',
      chunkNames: 'stageshow-[hash]',
      metafile: true,
    })
    failed(result)
    return result.outputFiles.map((f) => ({ name: basename(f.path), text: f.text }))
  })
  const written = []
  for (const f of outputs.filter((o) => o.name.endsWith('.js'))) {
    writeFileSync(join(outdir, f.name), f.text)
    written.push(f)
  }
  // Each scene's CSS pruned on its own, then merged: a rule two scenes share is written once
  const shared = await Promise.all(
    scenes.map((s, i) => {
      const css = outputs.find((o) => o.name === `${s.name}.css`)?.text ?? ''
      // Classes the scene's script can add: its own module and the shared chunks
      const js = outputs.filter((o) => o.name.endsWith('.js') && (o.name === `${s.name}.js` || o.name.startsWith('stageshow-'))).map((o) => o.text).join('\n')
      return sceneCss(frames[i], css, js)
    }),
  )
  // By layer, rule by rule, in first-seen order
  const layers = new Map()
  const props = new Set()
  const add = (layer, node) => {
    if (!layers.has(layer)) layers.set(layer, new Set())
    layers.get(layer).add(node.toString())
  }
  for (const c of shared) {
    for (const node of postcss.parse(c.rest).nodes) {
      if (node.type === 'atrule' && node.name === 'layer' && node.nodes) node.nodes.forEach((child) => add(node.params, child))
      else add('', node)
    }
    for (const p of c.props.match(/@property\s+[^{]+\{[^}]*\}/g) ?? []) props.add(p)
  }
  const merged = [...layers].map(([layer, nodes]) => (layer ? `@layer ${layer}{${[...nodes].join('')}}` : [...nodes].join(''))).join('')
  const sheet = (await transform(RESET + merged, { loader: 'css', minify: true })).code
  writeFileSync(join(outdir, 'stageshow.css'), sheet)
  written.push({ name: 'stageshow.css', text: sheet })
  const link = `<link rel="stylesheet" href="${base}stageshow.css">`
  for (const [i, s] of scenes.entries()) {
    const html = hostHtml(s.file, frames[i], link, [...props].join(''))
    writeFileSync(join(outdir, `${s.name}.html`), html)
    written.push({ name: `${s.name}.html`, text: html })
  }
  return written
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`
const size = (text) => `${kb(text.length)}, ${kb(gzipSync(text).length)} gzipped`

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.scenes.length || (args.scenes.length > 1 && !args.outdir)) {
    console.log('Usage: stageshow-export <scene> [--out file.html]\n       stageshow-export <scene>... --outdir dir [--base /url/of/dir/]\nA scene is an example id or a path to a .tsx file.')
    process.exitCode = args.help ? 0 : 1
    return
  }
  if (args.outdir) {
    for (const f of await exportScenes(args.scenes, args.outdir, args.base)) console.log(`${join(args.outdir, f.name)}: ${size(f.text)}`)
    return
  }
  const snippet = await exportScene(args.scenes[0])
  const out = args.out ?? `${nameOf(args.scenes[0])}.html`
  writeFileSync(out, snippet)
  console.log(`${out}: ${size(snippet)}`)
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((e) => {
    console.error(`export: ${e.message}`)
    process.exitCode = 1
  })
