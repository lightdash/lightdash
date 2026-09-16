# Delayed SDK visualization fixture

The seed serves a prebuilt bundle that announces screenshot availability immediately,
requests host rows, waits three seconds, then mounts the real `useVizContext` hook.
The commit paints a large `#ff00cc` SVG before acknowledging the host render ID.
Capturing earlier produces a white image. API tests require at least 20,000 magenta
pixels from saved-chart and later-tab dashboard exports, not merely a PNG signature.
This proves post-context paint, not arbitrary asynchronous work after that commit.

Regenerate from the current SDK source after editing the fixture or SDK:

```sh
node scripts/build-slow-data-app-viz-fixture.mjs
```

The script uses the installed frontend Vite/esbuild toolchain; it starts no server
or sandbox. `fixture.tsx.txt` is the editable source and `fixture.js.txt` is the
minified browser artifact with dependency license comments. The text suffix keeps
seed assets out of backend TypeScript/lint compilation. The seed uploads the JS
as `assets/slow-viz.js`; postbuild copies these fixture assets into backend dist.

The seed archive retains its minimal placeholder App source for as-code API tests;
it is synthetic and rebuilding that archive does not reproduce this served fixture.
Use the editable fixture source and regeneration command above to reproduce it.
