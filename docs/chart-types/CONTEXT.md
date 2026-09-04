# Chart type registry

Official, installable project chart types. Two halves make the feature: a
public **chart registry** that publishes prebuilt chart types as static
artifacts, and the in-product **chart type library** that lists them and
installs them into a project. Installed official chart types are read-only;
making one editable is an explicit fork.

Project chart types themselves — the viz schema, the explorer behaviour,
saved-chart version pinning — belong to the data apps context; use its
vocabulary (see `docs/data-apps/CONTEXT.md`, "Project chart type") for the
app/viz side and this glossary for the registry/library side.

## Language

**Chart registry**:
The static index and artifacts a Lightdash deployment reads installable
chart types from: an `index.json` catalog plus, per published version,
prebuilt `dist.tar`/`source.tar` with sha256 digests and screenshots. The
official registry is the `lightdash/lightdash-gallery` repo served from
GitHub Pages; a deployment points at exactly one registry URL.
_Avoid_: marketplace, store, hub, gallery (that is the in-product page)

**Chart type library**:
The in-product section of the chart type gallery that lists the registry's
chart types with their per-project install state (not installed, installed,
update available, incompatible).
_Avoid_: registry (for the UI), marketplace, app store

**Official chart type**:
A chart type installed from the registry. Read-only in the project — no
iterating, editing, or renaming — and carries provenance back to its
registry slug and version.
_Avoid_: built-in chart type (those are the native chart kinds), stock
chart, library chart

**Install**:
Importing a chart's prebuilt artifacts server-side into the project as a
read-only app, digest-verified against the registry index. No build runs on
the instance; install is per project.
_Avoid_: import, add, download (downloading is what the CLI does)

**Registry version**:
The semver of a published chart in the registry, recorded on each installed
app version. Distinct from the app's own integer version timeline: one
registry version becomes one appended app version on install or upgrade.
_Avoid_: release, build number

**Upgrade**:
Installing a newer registry version onto an already-installed official
chart type, appending a new app version. Which saved charts move is
governed by saved-chart version pinning (data apps context): pinned charts
keep their version, unpinned charts follow latest.
_Avoid_: update (as the verb; "update available" is only the list state),
reinstall

**Fork**:
The explicit, irreversible copy of an official chart type into a new,
fully-editable app owned by the project. Lineage is recorded (origin app
and version); the fork never syncs with the registry again. There is no
computed "modified" state — read-only until forked is the whole model.
_Avoid_: duplicate, customize, detach, eject

**Uninstall**:
Deleting the installed official chart type's app, with the standard app
delete confirmation. Reinstalling later is a fresh install.
_Avoid_: remove from library, deactivate
