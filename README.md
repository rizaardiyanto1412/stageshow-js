# stageshow-js

Stageshow without a framework. A skill for AI coding agents, plus a small kit,
that builds faux product UI and cursor demos: browser and app windows, phones,
chat threads, terminals, bento grids, and a cursor doing things in them. Each
scene exports as **one block of HTML, CSS and JS** that you paste into any page:
WordPress, Webflow, a static site, or a React, Svelte or Vue app. The host needs
no React and nothing to install.

It's a port of [Stageshow](https://github.com/benjitaylor/skills/tree/main/stageshow)
by Benji Taylor. The skill's design rules, gold examples and filming checks are
his; this port swaps the React runtime for plain JS and adds the export.

## Stageshow vs stageshow-js

Same skill, same look, same motion. What changes is what your page has to run.

| | [Stageshow](https://github.com/benjitaylor/skills/tree/main/stageshow) | stageshow-js |
|---|---|---|
| Runtime in your page | React 18+ and react-dom | None: about 25 KB gzipped of plain JS, engine included |
| Where a demo runs | Inside a React app | Any page: WordPress, Webflow, static HTML, React, Svelte, Vue |
| What you ship | The kit's components, copied into your app | `npm run export`: one paste-in block of HTML, CSS and JS |
| First frame | Rendered by React in the browser | Already in the HTML, sized by CSS, visible before any script runs |
| Page CSS | Shares the page's CSS (kit styles sit in a layer) | Isolated in a shadow root: the theme can't reach the demo, nor the demo the theme |
| Several demos on a page | Each mounts its own React tree | `--outdir` shares one engine script and one stylesheet across them |
| Writing a scene | TSX with React hooks for per-element memory | The same TSX, rendered to strings; small behaviors replace hooks |
| Icons | lucide-react | The same lucide icons as SVG strings, same names and props |
| Install | `npx skills add benjitaylor/skills --skill stageshow` | `npx skills add rizaardiyanto1412/stageshow-js --skill stageshow-js` |

Every example and teaching pair was ported and filmed side by side with the
React original. At 1280px and 390px, each poster frame and each settled beat
matched: 0% pixel difference, or under 0.2% where the gap was sub-pixel
anti-aliasing. The exception is three specimen sheets, where upstream's app
icon artwork (not MIT licensed) was swapped for plain tiles.

## Install the skill

```sh
npx skills add rizaardiyanto1412/stageshow-js --skill stageshow-js
```

This adds the skill to your project's agents (Claude Code, Cursor, Codex and
others). Run `npm install` in the installed skill's folder before using its
playground, filming and export tools.

## How it works

- You (or your agent) write a scene in TSX, the same way as upstream Stageshow.
  Here JSX renders to an HTML **string**, and a component is a plain function of
  its props.
- A `Stage` holds the scene's state. When its script changes the state, the
  stage re-renders the scene's markup and patches the live DOM to match it, so
  CSS transitions run as on any page.
- Parts that need more than a render, such as a number rolling from its old
  value or a spring that follows a drag, attach small behaviors to their
  elements (`kit/render.ts`).
- `npm run export <scene>` writes the scene as a snippet:

```html
<stageshow-scene>
  <template shadowrootmode="open">
    <style>/* only the kit CSS this scene uses */</style>
    <!-- the first frame, already rendered: visible before the script runs -->
  </template>
</stageshow-scene>
<script>/* the engine and this scene's script, minified */</script>
```

The shadow root keeps the page's CSS out of the scene, and the scene's CSS out
of the page. A typical scene is about 30 KB gzipped, everything included.

## Preview

Requires Node 20.19 or later and a local Chrome for filming. From this folder:

```sh
npm install
npm run dev
```

On macOS and Linux, open **http://stageshow.localhost:1355**. On Windows, Vite
starts directly; open the local URL it prints. The playground shows every gold
example, product study, specimen sheet and teaching pair. You can pause, step,
slow down, switch to a phone width, or show the reduced-motion still.

## Export a scene

```sh
npm run export -- hero-demo                          # examples/hero-demo -> hero-demo.html
npm run export -- path/to/my-scene.tsx --out demo.html
```

Paste the file's contents where the demo should appear. It fills the width of
its container, up to the scene's design width, and switches to the scene's
compact design in a narrow column. The demo plays while it's on screen. It
pauses off screen, and shows its still frame to visitors who prefer reduced
motion.

Site paths in the scene's CSS (`url(/images/bg.webp)`) stay as written and load
from the host page's site. Images the scene imports are inlined.

## Write a scene

```tsx
import { Stage, Window, Text, type Act } from 'stageshow-js'

type S = { done: boolean }

async function script(a: Act<S>) {
  await a.click('save')
  await a.set({ done: true })
  await a.wait(2000)
}

export default function Demo() {
  return (
    <Stage<S> width={520} height={340} initial={{ done: false }} script={script} play="once" cursor={{ at: { x: 470, y: 300 } }}>
      {(s) => (
        <Window url="app.example.com">
          <Text>Settings</Text>
          <button data-target="save" data-cursor="hand" data-done={s.done || undefined}>{s.done ? 'Saved' : 'Save'}</button>
        </Window>
      )}
    </Stage>
  )
}
```

Start from the closest gold example instead of from scratch: `SKILL.md`
explains the workflow, and `references/kit.md` lists every part.

These are authored illustrations. A scripted `a.click()` draws the cursor
pressing, and `a.set()` changes the scene. They don't automate real
application controls.

## Verify

```sh
npm run typecheck
npm run check:css
node scripts/film.mjs '<your URL>' --select '.your-demo' --gate
node scripts/film.mjs '<your URL>' --select '.your-demo' --width 390 --gate
node scripts/film.mjs '<your URL>' --select '.your-demo' --states --gate
```

For the bundled viewer, use `?capture=hero-demo` as the filming URL. See
`references/rehearse.md` for coverage, phone, hover, reduced-motion and visual
review. No automated result replaces watching the motion.

## Contents

- `kit/`: the engine (stage, script API, renderer), parts and styles.
- `examples/`: gold scenes, product studies and specimen sheets.
- `teaching/`: flawed and corrected pairs, kept apart from the gold.
- `references/`: design judgment, APIs and verification guidance.
- `scripts/`: the export, filming and verification tools.
- `playground/`: the local viewer.

See `NOTICE.md` for credits, third-party names and optional assets.
