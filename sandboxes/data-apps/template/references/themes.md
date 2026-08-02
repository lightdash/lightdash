# Organization themes (`/app/src/design/`)

> Read this when `/app/src/design/` exists — an organization theme is active and constrains the visual direction.

When `/app/src/design/` exists in the workspace, the organization has supplied brand assets that **must** drive the visual direction. The pipeline copies them in at build time; you do not create them. Treat their contents as inviolable: read and reference, never edit or duplicate.

Directory layout (any subdirectory may be empty):

- `/app/src/design/css/` — stylesheets. Inspect the style sheets and decide: If they are general colors and global styles **Import them** from your main entry point (`src/main.jsx`) before any of your own styles, so cascade order lets your CSS override theme defaults only where intentional. If they are component-specific (e.g. a `.fancy-button` class), **Reference them** in your JSX (`<button className="fancy-button">`) and use them as the basis for any custom components you build. You can build styles that typically match if the specific ones you are looking for are not there. 
- `/app/src/design/fonts/` — web fonts. **Reference them via `@font-face` in your own CSS** and use the resulting `font-family` everywhere you'd otherwise pick a font. Do not link to external font CDNs (Google Fonts, Bunny, etc.) when fonts are present here.
- `/app/src/design/images/` — logos and brand imagery. Import as ES modules (`import logo from './design/images/logo.png'`) so Vite hashes the URL. Use them in place of any generic logo/illustration you'd otherwise invent. Try to guess from the file names or context: is it a logo (use in the header), a pattern (use as a background), or a product screenshot (reference for UI details)? 

**Images are IMPORTANT and frequently more telling than the CSS or instruction files** — they carry intent the other assets can't express. Decide how to use them in this order:

1. **Use them as directed in the effective skill prompt or the user's prompt.** If the instructions tell you a specific image is the logo, or to apply a particular pattern, that's the answer — stop and follow it.
2. **If you have no further direction**, classify each image by inspecting both its filename and (when in doubt) its contents via the `Read` tool. Treat each kind seriously:
    - **Image assets** — things meant to appear in the rendered app: logos, mascots, hero images, icons, background patterns. Use them. A logo file means the header gets that logo, not a generic one you'd invent.
    - **Design assets** — outputs from a design tool: color-swatch sheets, type-specimen pages, component mockups, exported Figma frames. These are NOT meant to appear in the app — they are a binding spec for how the app should look. Mine them for exact hex values, type sizes, spacing, component shapes, and apply them to your own components. Treat them with the same authority as a CSS file.
    - **References and inspiration** — dashboard screenshots, product photos, mood-board imagery the organization wants the app to evoke. These ARE a directive, just at a higher level: match the aesthetic, density, and information hierarchy you see. Don't try to reproduce them pixel-for-pixel; do try to land in the same visual neighborhood.

When unsure which bucket an image falls into, prefer **design asset** or **reference** over guessing. A file that looks like a Figma export is almost never meant to ship in the app.

Hard rules when a theme is active:

- **Theme CSS overrides `frontend-design`'s color/typography direction.** The aesthetic distinctness `frontend-design` pushes for still applies to layout, density, and motion — but colors, font families, and any other tokens the theme CSS defines win over your own picks. If the theme sets `--accent: #6B5B95`, your headings use that purple; don't reach for a "more distinctive" alternative.
- **If the theme CSS defines a chart palette (CSS custom properties like `--chart-1`, `--chart-2`, …, or any `*-chart-*` variables), use it instead of `CHART_COLORS` from `@/lib/theme`.** Read the values via `getComputedStyle(document.documentElement).getPropertyValue('--chart-1')` once on mount and cycle them by index for multi-series. Falling back to `CHART_COLORS` when the theme doesn't define a chart palette is correct.
- **Instruction text in the appended system prompt is binding.** Any rules described under "Organization theme instructions" later in this prompt override conflicting defaults in this file. Treat them as customer-supplied product requirements, not suggestions.
- **Do not modify files under `/app/src/design/`.** `Write(//app/src/**)` would technically allow it, but those files are the source of truth for the brand and may be reused across many apps. Treat the directory as read-only.

When `/app/src/design/` does not exist or is empty, behave as if these rules don't apply — no theme is active and `frontend-design`'s direction is the whole story.
