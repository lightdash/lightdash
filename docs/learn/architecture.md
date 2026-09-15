# Learn: in-product training on a sample project

Learn gives every member of an organisation a place to practise Lightdash without touching real data: a
**training project** seeded with sample content, and a library of **walkthroughs** that each teach one permission
by having the learner click the real product, step by step, inside their own throwaway copy of that project.
This is the architecture-level view: what it is, what is possible, how it functions, and where the boundaries sit.
Code is the reference for anything finer-grained. Specs live in Linear (CS-207, CS-211, CS-257).

---

## What it is

- **A project type.** `ProjectType.TRAINING` (`packages/common/src/types/projects.ts`) is a project like any other
  in the database, created once per organisation from the same embedded DuckDB bundle the playground uses:
  precompiled explores cached from JSON, no dbt, no warehouse. Seeding adds a public *Training* space, charts, a
  dashboard, pins, a comment and catalog categories; on Enterprise it also adds a data app, an AI agent and a
  finished deep-research report, so every walkthrough has something to show.
- **A permission layer with no membership rows.** Every member of the organisation, whatever their org role,
  can see the shared training project and gets a *trainee* set of permissions on their own copies of it. Nothing
  is granted by an admin and new joiners are covered automatically.
- **Walkthroughs generated from the product.** A walkthrough is not written by hand. Product components carry
  `data-tour-*` markers beside the permission checks that gate them; a build-time script reads those markers and
  the docs repository and writes each walkthrough's steps as data. The library, the titles, the explanatory text
  and the checks that enforce the rules all derive from that.
- **Off by default.** The `enable-learn` feature flag turns Learn on per organization through the Console.
  Self-hosted operators add it to `LIGHTDASH_ENABLE_FEATURE_FLAGS`; previews enable it automatically. When it is off
  there is no Learn icon, no page, no endpoints and no permission layer, even if a training project already
  exists.

## Actors

| Actor            | Role                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| **Org admin**    | Presses Enable Learn once; becomes the training project's admin; the only one who can delete it.  |
| **Learner**      | Any org member. Browses the shared project as a viewer, practises in their own copy as a trainee. |
| **Seed**         | The playground bundle plus `content.json`: what every training project and every copy starts from. |
| **Generator**    | Build-time script that turns product markers and docs sentences into walkthrough data; CI enforces it. |
| **Tour kit**     | Renders one step at a time over the real product and advances on the learner's own click.         |


## What is possible

A learner opens the Learn library from the icon beside notifications, picks a module and presses Start. Lightdash
makes a fresh copy of the training project for them, opens the walkthrough on the page where it begins, and
highlights the one control to click at each step. Typed steps offer a suggestion so the learner never has to
invent input. The last step shows the result, then *Got it* opens a completion dialog and *Back to library*
deletes the copy and returns to the library, where the module is marked done.

Inside their copy a trainee can do what a project admin can, minus anything that breaks the project or reaches
outside it: explore, run SQL, save charts, dashboards and spaces, pin, comment, verify, categorise, export results,
and on Enterprise, ask the seeded agent, run deep research, and build and share data apps. They cannot change
project settings or the connection, compile, delete the project, send deliveries or Google Sheets syncs, use git,
source code or external connections, give an agent Slack channels or MCP servers, or read other people's threads
and analytics.

On the shared training project itself, everyone is a viewer. Nothing anyone does in a copy reaches the seed the
next learner copies from.

## How it functions

### Enabling

An organisation admin opens the Learn page and presses **Enable Learn** (`POST /api/v1/org/training-project`,
`organizationController.ts`). `provisionTrainingProject.ts` creates the project under a per-organisation advisory
lock, loads the embedded bundle, seeds the content (`ee/services/ProjectService/seedPlaygroundContent.ts`, shared
with the playground) and makes the admin who clicked the project's admin. If seeding fails the project is deleted
and the error surfaces. Enabling takes a second or two: nothing deploys, the DuckDB file ships in the image and
explores are precompiled.

### Permissions

`UserModel.applyTrainingProjectAbilities` runs when a session user's abilities are built. It finds the org's
training project and the user's own copies, then applies `getTrainingProjectViewerScopes()` to the shared project
and `getTrainingProjectScopes()` to the copies (`packages/common/src/authorization/roleToScopeMapping.ts`). The
trainee set is the project-admin scope list with organisation-only scopes and the exclusions above removed. The
layer only adds rights; it never removes any a user already holds. Service accounts and personal access tokens
never receive it, and it resolves by the user's own organisation so no one gets it on another org's project.

### Training copies

A copy is an ordinary preview project marked `provisioning_source = 'training'`, created by
`ProjectService.createTrainingPreview` (`POST /projects/{trainingProjectUuid}/training-previews`,
`projectController.ts`) and deleted by its `DELETE` counterpart. Copies carry the seed's content only: the seed
admin's charts, dashboards, comments and deep-research runs, never what a learner wrote on the shared project or
in another copy. A learner has one copy at a time (a per-user advisory lock and a short cooldown enforce this),
copies expire after 24 hours, and deleting a copy also removes its duplicated data-app files. Deleting the
training project deletes its copies first. A copy cannot be minted from the outside: preview creation and
metadata updates refuse a training project as upstream unless the call comes from the training path.

The navbar shows a copy as *Training copy* and skips the preview banner, since a copy is not a preview in the
engineering sense: no branch, nothing to promote.

### Developer sandbox

Inside a copy, a learner gets a small dbt project and a terminal that runs two commands against it. The project
is not a checkout: it is a bundle built once from the demo project (`scripts/playground-bundle`), stored beside
the DuckDB file, and materialised into a throwaway directory for the length of a single command. CSV seeds are
kept as their header line only, so `ref()` resolves and the bundle stays small; the rows themselves live in the
read-only DuckDB file the profile points at. Only `models/**/*.yml` is editable, edits are stored per copy in
`learn_workspace_files` and replayed over the bundle on each run, and everything else the learner sees is
read-only. Writes are parsed as YAML before they are accepted, so a broken file is rejected at save time rather
than surfacing as a confusing command failure.

`LearnSandboxService` runs the command as the learner. It mints a short-lived personal access token for the run,
passes it to the child, and deletes it when the command ends, so nothing durable is left behind; the scheduler
sweeps any token an interrupted run orphaned. The child's environment is an explicit allowlist rather than a copy
of the server's, because a learner's dbt YAML can read the environment back out through `env_var()`. One command
runs at a time per copy, enforced both in the service and by a partial unique index on `learn_commands`. The
subcommand allowlist is short on purpose: `lightdash compile|deploy|validate|lint|download|upload` and
`dbt parse|compile|ls`. Nothing that executes SQL against the warehouse is on it, so `dbt run` is refused.
`GET /api/v1/health` reports `learnSandbox.enabled`, which is true only when personal access tokens are enabled
and both `lightdash` and `dbt` are resolvable on the child's PATH.

#### Workspace page

The learner reaches the sandbox at `/projects/<copy>/learn/workspace`, inside the project layout. The route
resolves its own access: it opens only on a preview whose upstream is the training project, and only while the
sandbox gate is open, so the shared training project and every real project redirect to the library rather than
answering with an error. The page is three panes over the copy (the file tree, a YAML editor and the terminal)
under a strip carrying the copy's name and a `Back to library` link. Tours drive it through
`data-tour-anchor="workspace-file"`, `"workspace-editor"`, `"terminal-command"` and `"terminal-run"`, and wait on
the output pane, which carries `data-tour-busy` and `data-tour-status` while a command runs and, for that same
duration, the anchor `data-tour-anchor="terminal-running"`; `data-learn-workspace`, `data-learn-file`,
`data-learn-editable`, `data-learn-terminal-output` and `data-learn-back-to-library` are there for tests and
walkthrough verification.

Edits are held per file in the page and autosaved rather than saved by a button: on editor blur, and again
before every run, so a command never runs against a file the learner has changed on screen but not on disk. A
save that fails leaves the edit in the editor, reports the reason in a toast, and blocks the run that triggered
it. The terminal parses the typed
command in the browser before asking for anything, so an input that is not `lightdash` or `dbt` never becomes a
request. A run the server refuses because a command is already in flight is not an error: the reply names the
running command, and the pane attaches to its output and streams it to the end.

Two knobs exist for that PATH and for where the child sends its API calls. `LEARN_SANDBOX_PATH_PREFIX` is a
colon-separated list of directories prepended to the child's PATH (default `/usr/local/dbt1.12/bin`); it is how a
deployment points the sandbox at the dbt and `lightdash` binaries it ships, and on a developer machine it is how
you point it at a local CLI build and a dbt-duckdb virtualenv. Because the environment is an allowlist rather
than an inheritance, whatever runs the commands must be reachable through that prefix or through the PATH the
backend process itself inherited, `node` included. `LEARN_SANDBOX_API_URL` overrides the `LIGHTDASH_URL` the
child talks to, which otherwise defaults to `siteUrl`; set it when the address the browser uses is not an address
the backend host can reach itself. The child also receives `LIGHTDASH_API_TIMEOUT_MS=30000`, so a stalled API fails one CLI request with a clear
message inside the command's 120 s limit rather than pinning the command until it is killed. `LEARN_SANDBOX_MAX_CONCURRENT_COMMANDS` (default 4) caps how many sandbox commands run at once on a worker: commands are
spread over that many scheduler queues by project, each queue runs serially, so a project's commands never overlap and the
worker never hosts more dbt processes than the cap. `PLAYGROUND_DATA_DIR` continues to name the directory holding
`jaffle_shop.duckdb`, and the sandbox passes it through to the child, since the CLI accepts a local DuckDB
profile only when the file sits directly inside it.

#### Lessons

A lesson teaches one docs page by having the learner change the project and then look at what changed. Each is
declared in `features/learn/sandboxLessons.ts`, one entry per page, naming the file to open, the column the snippet
extends, the snippet to add, the command to run, and the explore and field the learner ends on. Every
sentence the learner reads is either a cited docs sentence (a step may cite several, read in order) or one of
two fixed task sentences the template fills from the entry (which metric to add and which column's metrics
it goes under, and which metric the learner ends on), so the snippet and the entry's facts are
the only parts written by hand. The library lists each lesson as a module of kind
`docs` in the Developer group, gated on the sandbox rather than on a permission, so every learner holds it. The
generated teaching order (`curriculum.ts`) covers permissions and does not name lessons at all, so the library
sorts them after every walkthrough. Start makes a copy the way a walkthrough does and opens
`/projects/<copy>/learn/workspace?tour=<id>`.

The tour itself is not authored. `buildLessonTours` in `scripts/scope-tours/lib.ts` turns each entry into the
same twelve steps: read the page's introduction on a card with nothing spotlit, open the file, add the snippet, type the command, run it, watch the
output to the end, then New, Chart, search for the table, open it, search for the field, and look at the field
that now exists. The two searches are not decoration: both lists in Explore are virtualised, so neither the
table nor the field is on the page until it has been searched for, and they are two different controls, because
opening a table replaces the table list with the field tree. The snippet starts with the key it extends (`metrics:`), and Use it types the
lines after it directly under the last line in the file that is that key, so the entry appears where a developer
would write it and the card shows the path it takes; the build checks that key belongs to the column the cards name. `pnpm test:learn-lessons` compiles every snippet against the shipped bundle,
so that mistake fails a build rather than a learner. Use it types the snippet into the editor one character at a time, scrolls
it into view and highlights the added lines for a moment, so the learner sees what changed and where before the
tour moves on. A deploy that finishes invalidates the explore list in the
browser, because the learner walks straight to the new field and a cached list would not have it.

### Walkthroughs

- **Markers.** A control that a scope unlocks carries `data-tour-scope`, `data-tour-step`, `data-tour-route`,
  `data-tour-label` and `data-tour-docs` beside the ability check that hides it; the full vocabulary is documented
  at the top of `scripts/scope-tours/generate.ts`. The first step's marker sits on the result the walkthrough
  proves.
- **Generation.** `scripts/scope-tours/generate.ts` reads the markers and the docs repository
  (`LIGHTDASH_DOCS_DIR`) and writes `packages/frontend/src/features/scopeTours/generated.ts`: one tour per scope,
  step text taken from cited docs sentences, links allowlisted to the docs site. `check.ts` enforces the rules
  (one control per step, docs anchors exist, no typed steps without a suggestion, titles and bodies within
  length, routes known) and CI runs it with `scope-tours-check.yml`; `smoke.ts` completes every tour on a running
  instance by clicking only what it highlights. The smoke runs by hand, not in CI, so a product change that keeps
  every marker but changes the click path passes CI. The skill `.claude/skills/add-scope-walkthrough` is the
  recipe for adding one; `maintaining-walkthroughs.md` covers what to do when a product change breaks one.
- **Host and kit.** `features/scopeTours/ScopeTourHost.tsx` mounts on project routes, reads the tour for the
  scope in the URL, requests a copy when the current project is the training project, and drives
  `components/common/GuidedTour`: an overlay that blocks everything but the highlighted control, a card with the
  step's title and docs sentence, scrolling the target into view inside any scrolling ancestor, and the completion
  dialog.
- **Library.** `features/learn/LearnPage.tsx` lists one module per trainee scope from `catalogue.ts`: the title is
  the scope registry's description, the group is the registry's group, the module is available when a generated
  walkthrough exists, and its blurb is that walkthrough's opening docs sentence. Foundations (what a viewer can
  already do) is the first section. Progress (`progress.ts`) is kept in the browser for now.
- **Library search.** `features/learn/search.ts` indexes module titles, blurbs, permission names, and every
  walkthrough step's title and body with the existing Fuse.js dependency. It ignores conversational filler,
  requires each remaining query word to match, and tolerates small typos. Available walkthroughs rank first;
  title matches rank above step text within each group. The index is rebuilt when the visible catalogue changes,
  not on each keystroke; clearing search restores the teaching order and keeps the learner's filters.
  Search runs entirely in the browser, using bundled content, with no API key, model download, outbound request,
  or query telemetry. It is lexical search: paraphrases with no matching words still need better walkthrough
  wording or a future synonym layer.
- **Lessons.** A developer lesson's tour sits in `SCOPE_TOURS` under its `docs:` id like any other, so the host,
  progress, library search and the completion dialog handle it with no special case. `curriculum.ts` covers
  permissions and does not name lessons, so the library sorts them after every walkthrough.

## Boundaries and invariants

| Boundary                         | Enforced by                                                                 |
| -------------------------------- | --------------------------------------------------------------------------- |
| Shared training project is read-only for learners | `getTrainingProjectViewerScopes()` on `ProjectType.TRAINING`             |
| Trainee rights only in the learner's own copy     | copy = `PREVIEW` + `provisioning_source='training'` + `created_by` = user |
| No real data reachable                            | embedded read-only DuckDB file, SELECT-only gate, no filesystem or network functions |
| No way outside the copy                           | trainee set excludes deliveries, sheets, git, source, external connections; agents in training refuse Slack and MCP; moving an agent checks the destination |
| One copy per learner, bounded lifetime            | per-user advisory lock, cooldown, 24 h expiry, app files deleted with the copy |
| Nothing shows when Learn is off                   | `enable-learn` gates the icon, page, endpoints and the permission layer    |

## Traps

- **The shared project is read-only on purpose.** A learner who cannot save a chart there is not missing a
  permission; saving happens in the copy. Do not grant the trainee set on `ProjectType.TRAINING`.
- **A copy is recognised by `provisioning_source`, not by `copied_from` or the upstream link.** Both of those can
  be set from the public API; the provisioning source only by the internal path. Any new check for "is this a
  training copy" must use `provisioning_source = 'training'`.
- **Only the seed admin's content travels into a copy.** Comments and deep-research runs are filtered by the
  training project's creator. Copying "everything in the project" would leak one learner's work into the next.
- **The project-wide app listing answers 403 for learners by design.** `GET /ee/projects/{uuid}/apps` is the
  admin, CLI and embed view; the browse page uses the access-filtered content listing. A 403 there is not a bug in
  the viewer set.
- **Enterprise modules disappear without a licence, and data apps need the flag as well.** The library hides
  them; a walkthrough started by URL for a hidden module will stall on a control that is not rendered.
- **A fresh checkout serves stale routes.** `routes.ts` is committed only by the release workflow; run
  `pnpm -F backend generate-api` after checking out a branch that adds the Learn endpoints, or every one of them
  answers 404. The Rainbow recipe does this in its build.
- **The sandbox needs its tools on the child's PATH, not on yours.** `learnSandbox.enabled` is false when
  `lightdash` or `dbt` is missing from `LEARN_SANDBOX_PATH_PREFIX` plus the backend's own PATH, and the terminal
  disappears with no other explanation. The same allowlist means the child cannot see a host variable simply
  because the shell that started the backend had it.
- **`enable-learn` off closes Learn for the organization.** No icon, no page, no endpoints and no trainee scopes,
  even with a training project in the database. Cached session abilities expire on their existing TTL.

## Where it is going

Stack 1 merges behind the switch and goes live on the internal instance first (CS-263), with the walkthrough
content following in six further pull requests. Next on the product side: a playground badge and a deletion guard
for the training project (CS-261), a visual pass on the kit and library (CS-262), library search and a "request a
module" route (CS-258, CS-259), and progress stored server-side rather than in the browser.

## Rollout

Stack 1 (PRs #28710 to #28716) carries the type, the permission layer and copies, the seeded content, the tour
kit, the host and generator, the library, and Enable Learn. Walkthrough content follows in further pull requests.
Learn remains off until `enable-learn` is enabled for the organization in the Console, or added to
`LIGHTDASH_ENABLE_FEATURE_FLAGS` on self-hosted instances. Previews enable the flag automatically.
