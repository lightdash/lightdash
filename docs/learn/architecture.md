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
