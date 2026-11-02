# Notices

stageshow-js is a port of Stageshow by Benji Taylor
(https://github.com/benjitaylor/skills/tree/main/stageshow, MIT) from React to
plain JavaScript. Both are MIT licensed; see `LICENSE`.

Product and operating-system names, familiar device geometry, app icons, and
illustrated interfaces are used as examples. Those names and marks remain
with their owners; the Stageshow license does not grant trademark rights or
imply endorsement. Adapt examples to the product you are illustrating.

The Radix-inspired look uses publicly documented color and spacing values;
its source is identified in `examples/looks/radix.css`. Upstream's app icon artwork (`assets/app-icons.ts`), which is not
MIT licensed, is not included in this port; the examples that used it draw
plain placeholder tiles instead. The Wikipedia
study includes two local photographs dedicated under CC0 1.0 (also used
in the Finder, Telegram and annotation studies); their authors,
original source pages and modifications are recorded in
[`examples/wikipedia/PHOTOS.md`](examples/wikipedia/PHOTOS.md). Other scenes
use CSS and vector illustrations. No third-party fonts are bundled, and the
playground does not fetch fonts or photographs from external services at runtime.

The local brand registry in `kit/brands/` includes SVG artwork from SVGL (MIT), payment-icons (Apache 2.0), Cryptocurrency Icons (CC0 1.0), and official Linear, American Express and Circle assets. Per-file sources, hashes and license files are listed in [`kit/brands/SOURCES.md`](kit/brands/SOURCES.md). The original artwork and brand usage terms remain with their respective owners.

`Phone frame="photo"` needs your own permitted bezel image, set with
`--ss-phone-photo-light: url(...)` and optionally `--ss-phone-photo-dark`;
without one it draws an empty shell, so use the CSS-drawn `pro` frame instead.
No bezel photographs are bundled.
