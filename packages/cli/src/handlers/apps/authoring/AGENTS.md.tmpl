# Working on this Lightdash data app

Two skills in `.claude/skills/` describe how to edit this app:
- `lightdash-data-app` — the Lightdash SDK surface (querying data, filters, downloads).
- `developing-data-apps-locally` — the local workflow: edit `src/`, `lightdash apps validate --build`, `lightdash apps preview`, `lightdash upload --apps <slug>`; the SDK is the only data access; `.lightdash/context/` holds the project's semantic layer and theme.

Edit only `src/`. Root config files are read-only reference — the server rebuilds against a trusted template.

Use `lightdash apps validate --build` for the Cloud-parity local pre-check. It builds `src/` against the CLI's trusted template and reports Vite failures as validation errors. Apps made with `lightdash apps create` already have dependencies installed; after `lightdash download`, run `npm install` first if `node_modules` is absent. Never modify machine config, npmrc, or dependency files to force the check to pass. The server still rebuilds on upload and surfaces its final result on the app page.

Build with the template's preinstalled dependency set (see `package.json`). Adding new npm packages only works when the Lightdash organization has custom dependencies enabled — assume it does not; ask the user before considering a new library, and never vendor library source into `src/` as a workaround. Where enabled, adding a dependency is the one workflow that still requires pnpm: upload requires a matching `pnpm-lock.yaml`, so `pnpm add <pkg>` (or `pnpm install --lockfile-only`) must succeed locally. If it fails, stop and report the error — hand-editing `package.json` without the lockfile makes the upload fail.

`.npmrc` sets `ignore-scripts=true` — never remove it or run installs with scripts enabled; this app may be authored by someone else and their dependencies' lifecycle scripts must not run here.
