# Data App Themes as Code

Use organization Data App themes to give generated and iterated Data Apps a shared visual direction through CSS, fonts, images, and generation instructions. Themes are organization resources: manage them through the existing organization content workflow, not through a standalone theme command.

## Contents

- [Supported workflow](#supported-workflow)
- [Theme package layout](#theme-package-layout)
- [Authoring assets and instructions](#authoring-assets-and-instructions)
- [Validation and limits](#validation-and-limits)
- [Synchronization semantics](#synchronization-semantics)
- [Evaluating a theme](#evaluating-a-theme)
- [What a Data App theme is not](#what-a-data-app-theme-is-not)

## Supported workflow

Use the same commands for existing UI-created themes and themes created locally:

```bash
lightdash download --organization --path ./lightdash
# Edit or add ./lightdash/themes/<slug>/
lightdash upload --organization --path ./lightdash
```

Theme package export and import require `manage:OrganizationDesign`. If organization download fails with a permission error, use an appropriately authorized account; do not interpret the failure as an organization with no themes.

Before downloading into an existing repository, check for uncommitted changes. A successful organization download replaces the complete local `themes/` directory with the remote theme set and can overwrite local theme edits.

Before uploading, review the complete organization-content diff and obtain approval when the target is shared or production. There is no theme-only selector: organization upload also processes custom roles, users, and groups found under the same content root.

After uploading, inspect every resource summary. To prove a theme round-trips, download the organization content into a clean directory and compare the resulting manifest and asset bytes.

### Move an existing UI-created theme into version control

1. Run `lightdash download --organization`.
2. Find the theme under `themes/<slug>/`; keep its downloaded slug and directory name unchanged.
3. Review and commit the manifest and assets.
4. Edit and upload through the normal organization workflow.

Do not recreate an existing theme manually from its display name. The downloaded slug is its immutable identity.

### Create a theme locally

1. Choose a new lowercase hyphenated slug.
2. Create `themes/<slug>/lightdash-theme.yml` with every required manifest field.
3. Add only the asset directories and files the theme needs. Empty asset directories are optional because Git does not preserve them.
4. Review the package, then run `lightdash upload --organization`.

Upload creates the theme when its manifest slug does not exist and updates the same theme when it does.

## Theme package layout

```text
lightdash/
  themes/
    acme-brand/
      lightdash-theme.yml
      css/
        theme.css
      fonts/
        acme-sans.woff2
      images/
        logo.svg
      instructions/
        usage.md
```

The directory basename must exactly match the manifest slug. Files may appear only directly inside the four asset directories; nested directories and symlinks are rejected.

The manifest is strict: all five fields are required and unknown fields are rejected.

```yaml
codeVersion: 1
slug: acme-brand
name: Acme Brand
description: Brand theme for customer-facing Data Apps
extraInstructions: |-
    Use the horizontal logo in page headers.
    Keep data-dense tables compact.
```

Use `null` when either optional text value has no content:

```yaml
description: null
extraInstructions: null
```

Slug rules:

- Use lowercase letters and numbers separated by single hyphens.
- Do not use leading, trailing, or repeated hyphens.
- Do not use a UUID-shaped slug.
- Keep the slug at or below 255 characters.
- Treat the slug as immutable. To rename a theme for display, change `name`, not `slug`.

## Authoring assets and instructions

### CSS

Put `.css` files under `css/`. Prefer reusable variables and styles that communicate the brand rather than page-specific application code. Give variables and classes clear names, and keep light/dark behavior intentional.

Theme CSS is an input to Data App generation, not a stylesheet injected into every existing app at runtime. The generation agent inspects and imports applicable CSS when building or iterating an app.

### Fonts

<!-- Keep Apple system-font fallback values aligned with the canonical constants in packages/backend/src/services/OrganizationDesignService/restrictedAppleFonts.ts. -->

Put ordinary licensed web fonts under `fonts/`. Supported formats are `.woff`, `.woff2`, `.ttf`, and `.otf`. Reference bundled fonts through `@font-face` rather than an external font CDN.

Restricted Apple system-font binaries such as SF-family or New York fonts are rejected during upload and omitted from new Data App generations when found in a legacy theme. Do not commit them to a theme package. Use a system stack instead, for example:

```css
font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
```

Use `ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace` for SF Mono and `ui-serif, Georgia, serif` for New York.

### Images

Put `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, or `.svg` files under `images/`. Use descriptive filenames and explain ambiguous assets in the instructions: distinguish logos and product imagery from design references, screenshots, and mood boards.

### Instructions

Put Markdown instruction files under `instructions/`. Their contents and `extraInstructions` are appended to the generation prompt when the theme is active. Use them for precise rules about asset roles, typography, chart colors, density, spacing, and allowed exceptions.

Do not put secrets in theme files or instructions. Theme content is copied into Data App generation context and may influence generated source.

## Validation and limits

Theme upload performs local preflight before any organization resource is mutated. There is no standalone theme validator, and `lightdash lint` does not validate theme packages.

The local package must satisfy these rules:

- `lightdash-theme.yml` must be valid UTF-8 YAML, at most 64 KiB, with unique keys and the exact manifest shape above.
- Each asset must be a non-empty regular file at most 10 MiB.
- All assets together must be at most 100 MiB. There is no separate file-count limit.
- The generated uncompressed tar package must be at most 110 MiB.
- CSS and Markdown must be valid UTF-8 text. SVG must begin with an SVG/XML marker.
- Binary font and image bytes must match the filename extension.
- Filenames must be at most 255 characters, have no surrounding whitespace, and contain no slash, backslash, null byte, or `..`.
- Paths are checked case-insensitively for duplicates.
- Unknown files or directories, nested directories, and symlinks reject the package. `.DS_Store` is ignored.

Preflight reports every invalid local theme it can discover in one error. Fix all reported paths before retrying.

## Synchronization semantics

### Download

- Downloads every theme visible to the authenticated organization account; there is no per-theme selector.
- Writes deterministic manifests and asset paths under `themes/<slug>/`.
- Stages the complete remote theme set before replacing the local `themes/` directory.
- Leaves the previous local theme set intact if listing, package download, or package validation fails.
- Removes stale local theme directories that no longer exist remotely after a fully successful download.

### Upload

- Preflights every local theme before uploading custom roles, users, groups, or themes. One invalid local theme prevents all organization mutations.
- Applies remote organization phases as custom roles, then users, then groups, then themes. A failure in an earlier phase prevents theme imports from starting.
- Upserts each theme by manifest slug. Existing UUIDs and existing default status are preserved; newly created themes are not made default.
- Skips a theme when its manifest and complete file set are unchanged.
- Treats a missing or empty `themes/` directory as a no-op. Removing a local theme directory does not delete the remote theme; the next download restores it.
- Imports each theme atomically, but does not wrap the whole theme batch in one transaction. Successful themes remain applied when a sibling import fails, and the CLI reports all completed slugs and failures.

There is no CLI operation to delete a theme or select the organization default. Use the Lightdash UI for those actions. There are also no theme-specific include, skip, only, force, create, list, download, upload, validate, or preview commands.

The CLI and server must have compatible theme-package support. An endpoint `404` from organization theme sync usually means the CLI is newer than the server, not that the organization has no themes.

## Evaluating a theme

Separate package verification from visual evaluation:

1. Verify the package through the CLI: upload it, inspect the organization-resource summary, download into a clean directory, and compare the manifest and asset bytes.
2. Explain that evaluating the theme's visual effect requires one new Data App generation or an iteration of an existing app with that theme selected. Uploading the theme does not rebuild or restyle existing app versions.
3. Do not assume access to the user's Lightdash UI. Ask the user to select the theme and start the generation or iteration. If they want the resulting app reviewed locally, ask for its app reference, download it with `lightdash download --apps <ref>`, and follow the normal Data App inspection and preview workflow.
4. When the generated result is available, review both relevant host color schemes unless the theme deliberately requires one fixed scheme. Check that CSS, fonts, images, instructions, and chart colors were applied as intended.

If the task only covers authoring or synchronizing the package, report the CLI verification separately and be explicit that generation quality was not visually evaluated.

There is no supported standalone local preview for an organization theme. A downloaded app's `.lightdash/context/theme/` directory is a read-only snapshot for local app authoring, not the source package to edit. During server-side generation, the active theme is copied under `/app/src/design/`; that path is also generated context, not the organization source of truth.

## What a Data App theme is not

- **Lightdash appearance or chart palettes:** these configure Lightdash UI and visualization colors. They are not organization Data App theme packages and are not synchronized under `themes/`.
- **SDK light/dark mode:** the Data App SDK follows the viewer's Lightdash color scheme at runtime. An organization theme supplies brand direction during generation; it does not replace that runtime protocol. Theme CSS may deliberately constrain color-scheme behavior, but that decision must be explicit.
- **Organization brand settings:** saved brand colors, logos, and fonts are a separate source used by other Lightdash workflows. They are not automatically converted into this v1 file package.
- **An app manifest selection:** `lightdash-app.yml` does not pin an organization theme in v1.
