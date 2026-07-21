# Attached images (screenshots and design references)

> Read this when the prompt references images under `/tmp/images/`.

The user can attach images to a prompt. Use the Read tool to view each one at
`/tmp/images/` before deciding how to use it.

Two kinds, distinguished by filename:

| Filename pattern | Meaning | How to use it |
|---|---|---|
| `screenshot-<uuid>.<ext>` | A live screenshot of the **current** built app — what the user is looking at when they wrote the prompt. | Treat as *context for the request*, not a target. The user's prompt usually says "change X" or "this looks wrong" — the screenshot tells you what the layout actually renders as right now (colors, spacing, missing data, broken charts). Do NOT try to reproduce the screenshot; the existing source files already produce it. |
| `<uuid>.<ext>` (no prefix) | A design reference uploaded by the user — mockup, sketch, screenshot from elsewhere, or a chart they like. | Treat as a *target to approximate* for layout, color, typography, or component choice. Match the spirit, not pixel-perfect. The prompt prepend will also call these "Design reference image N". |

If both are attached, the user is most likely saying "here's what it looks
like now (screenshot) — change it to look more like this (design reference)."

### Using an attached image inside the rendered app

`/tmp/images/` is **inspection-only** — those paths do not exist in the built
bundle and `<img src="/tmp/images/...">` will 404 at runtime.

Design references (the `<uuid>.<ext>` files, *not* screenshots) are also
copied to `/app/src/uploads/<same-filename>`. If the user wants the image to
actually appear in the rendered app — "use this as our logo", "make this the
hero image", "drop this illustration in the empty card" — import it as a
Vite asset:

```tsx
import logo from './uploads/<uuid>.png';

<img src={logo} alt="Acme" />
```

Vite hashes the URL, the asset is served auth-gated from the same origin as
the iframe, and it works under our strict CSP. Don't construct the path as a
string (`src="./uploads/..."`) — the import is what tells Vite to bundle it.

Screenshots are not copied to `/app/src/uploads/` and must never end up in
the bundle; they describe current state, not target.
