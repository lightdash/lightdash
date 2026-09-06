---
name: add-scope-walkthrough
metadata:
  internal: true
description: Add a generated in-product walkthrough (a training module) for a permission scope, e.g. manage:PinnedItems, manage:Space, manage:SavedChart. Use when the user wants a new training lesson, tour, or walkthrough for a Lightdash feature, or asks to teach a scope. Produces markers and anchors in the frontend, a generated tour, and a recorded verification flow; never hand-written steps or prose.
allowed-tools: Read, Edit, Write, Glob, Grep, Bash
---

# Add a scope walkthrough

A walkthrough teaches one permission scope by having a learner click the real UI, step by step, inside their own throwaway copy of the training project. Nothing about a walkthrough is written by hand: steps come from markers placed beside the ability checks that gate the controls, titles come from the controls' own hints, explanatory text comes from docs sentences, and the result is proved by a recorded flow. This skill is the recipe. Follow it in order; every rule below was settled in review and the checker (CS-209) will enforce them.

## Rules that never bend

1. **One control per step.** The learner clicks exactly one thing per step; the step is titled by that control's hint.
2. **The learner navigates.** The tour never changes the page for them, except into their fresh training copy at the start. Page changes are their own clicks on spotlighted controls.
3. **Only the highlighted control is clickable.** Everything else is blocked, including clicks that would close a menu.
4. **No Back. No Next on click steps.** The final target is inert until Got it.
5. **Typing needs a suggestion.** If the product already supplies a value (a suggested chart name, a preselected space, an agent's suggested question), the step is "accept it" with one click. If it does not (a dashboard's name), the step is typed: mark the field `data-tour-input="true"` and give it `data-tour-suggest="..."`, a value that fits the seeded content; the card offers it with a Use it button and the learner may type their own instead. A typed step with nothing suggested fails the checker. Do not invent a product default just to avoid the typed step.
6. **Explanatory text comes from the docs**, cited by section and sentence. Labels and hints are short imperatives; they never explain.
7. **Representative content.** Steps that pick one of many (a space, a table, a chart) name the seeded item by label so the walkthrough reads like the learner's own project. Take names from the seeded content (step 3), never invent them.
8. **The result must be visible.** Every walkthrough ends on the surface where the change shows, reached by the learner's own clicks (or where the action itself lands). A result with several parts (an agent reply has its words, its chart and its rating controls) gets one look per part, each cited from the docs, so nothing on the screen goes unexplained.
9. **A step is not over while the page is working.** If the result arrives over time (an agent reply, a query), mark the working surface `data-tour-busy` and its status words `data-tour-status`; the closing step then holds Got it and mirrors the product's status until the work is done. Between steps, a control that has not appeared yet is waited for as a beacon; no card shows until the control is there.

## Vocabulary

Markers and anchors are `data-tour-*` attributes in `packages/frontend/src`. The generator (`scripts/scope-tours/generate.ts`, run with `pnpm scope-tours:generate`) reads them and writes `packages/frontend/src/features/scopeTours/generated.ts`. Read the header comment of the generator before you start; it is the contract.

| Attribute | Where | Meaning |
|---|---|---|
| `data-tour-scope`, `data-tour-step` | the control the scope unlocks (step 2) and the surface showing the result (step 1) | which walkthrough, and the marker's order |
| `data-tour-route` | markers | page the marker lives on (informational) |
| `data-tour-label` | markers | the step title, a short imperative ("Click Pin to homepage") |
| `data-tour-docs` | markers | `file#anchor[:pN][:n or a-b]` docs sentence(s) for the body; `file#intro` is the page's text before its first heading; `:liN` the Nth list item of the section |
| `data-tour-interactive="true"` | the action marker | the learner clicks it; the tour advances on that click |
| `data-tour-via` | the action marker | click path to it: `[sel] >> [sel] >> ...` |
| `data-tour-then` | the action marker | clicks after it that complete the action (a confirm) |
| `data-tour-return` | the result marker | click path back to the result at the end; `none` when the action lands there; default is the home link |
| `data-tour-resultdocs` | the result marker | docs sentence for the closing step |
| `data-tour-result="n"` + label + docs | further surfaces of the result (the answer text, the chart, the rating controls) | one closing look each, in order, after "See the result"; a result that has parts gets a step per part |
| `data-tour-look="n"` + `data-tour-after='<sel>'` + label + docs | a surface worth a look on the way (a tile while the dashboard is still editable) | a read step right after the path click `after` names, before the action; use it when the thing to notice is gone once the action is done. Add `data-tour-interactive="true"` for a hands-on look: nothing is blocked, the learner may drag or resize the surface, the ring follows it, Next moves on |
| `data-tour-suggest="..."` | a typed anchor | what the card offers to fill in with one click (see rule 5) |
| `data-tour-busy` | the result marker | selector of the page's own "still working" surface (a streaming reply, a running query); the closing step follows it, shows the last `[data-tour-status]` words inside it, and holds Got it until it is gone |
| `data-tour-status` | text inside a busy surface | the product's own words for what it is doing; the card mirrors them |
| `data-tour-nav`, `data-tour-anchor` + `data-tour-hint` | controls along paths | reusable anchors; the hint is the step title when a path uses them |
| `[data-tour-anchor="x"][data-tour-value="Label"]` | in a path | one of several controls sharing an anchor, by label; `{value}` in the hint becomes the label |

Anchors already in place (reuse before adding): `data-tour-nav`: `new`, `new-chart`, `browse`, `all-spaces`, `home`, `ask-ai`. `data-tour-anchor`: `explore-table`, `explore-metric`, `explore-dimension`, `run-query`, `chart-save-to-space`, `chart-save-next`, `chart-save-submit`, `space-option` (by label), `space-row`, `space-actions`, `space-share`, `modal-close`, `modal-confirm`, `resource-actions`, `ai-suggestion`, `dashboard-create-next`, `dashboard-create-submit`, `add-tile`, `add-saved-chart`, `chart-picker`, `chart-option` (by label), `add-charts-submit`, `dashboard-row` (by name), `chart-row` (by name), `zoom-option` (by label), `add-space`, `space-name`, `pinned-item` (by name, both homepage variants), `category-option` (by label, declared beside `optionAnchor` in `CategoriesFilter.tsx`), `dashboard-name` (typed), `results-heading`, `results-metric-cell` (computed, hints in comment lines), `export-download`, `tile-comments`, `comment-editor` (typed, the new-comment form only), `comment-actions`, `metric-categories` (by metric label), `edit-chart`, `add-table-calculation`, `table-calc-sql-mode`, `table-calc-sql` (typed, an Ace editor), `table-calc-name` (typed), `table-calculation-column` (a calculation's results header), `add-custom-dimension` (the sidebar's Dimensions Add button), `custom-dimension-label` (typed), `custom-dimension-sql` (typed, an Ace editor), `sql-runner-editor` (typed, Monaco, hands the tour a `tourEditor`), `sql-runner-run`, `sql-save-chart`, `sql-chart-name` (typed), `sql-chart-save-next`, `sql-cta-menu`, `sql-cta-virtual-view`, `sql-create-virtual-view` (the same button once that action is chosen), `virtual-view-name` (typed), `explore-search` (typed, the tables search), `explore-section` (a collapsed section of the tables list, by label), `chart-actions` (the chart header's kebab menu), `agent-selector`, `agent-new` (the Create new agent option), `agent-name` (typed), `agent-instructions` (typed, a textarea), `customize-homepage`, `homepage-block` (a block in the homepage builder's library, by label), `app-row` (by name), `app-actions`, `app-add-to-space`, `transfer-confirm` (the shared move-to-space dialog's confirm), `app-template` (a data app starting template, by title), `app-prompt` (typed, the new-app prompt composer; the kit fills the editor inside it), `composer-options` (the Ask AI composer's options menu), `agent-thread` (a sidebar thread, by title), `research-report-open` (a deep research run card's View full report); `ai-suggestion` sits only on prompt chips (navigate chips that continue a past thread carry no anchor, so `[data-tour-anchor="ai-suggestion"]` always fills the composer); `data-tour-nav` also has `all-apps` and `new-app` (New > Data App); `data-tour-nav` also has `new-sql-runner`; `data-tour-nav` also has `new-dashboard`, `all-dashboards`, `all-charts`, `metrics` (bar button or Browse entry, whichever the catalog shows) and `learn`. `FilterFacet` takes `triggerProps` (its button) and `optionAnchor` (each option, by search label). A `CollapsableCard` takes `tourProps` (the card) and `headingTourProps` (its click-to-open heading) as object literals; the generator reads object-literal markers too. An anchor whose name is computed in code declares its hints as literal comment lines beside the element (see `TreeSingleNode.tsx`). A marker on a component that does not spread its props needs the component to forward `data-tour-*` (see `ComposerSubmitButton.tsx`).

Reference walkthroughs: `manage:PinnedItems` (7 steps, click-only), `manage:Space` (12 steps, dialog with confirm and a return path), `manage:SavedChart` (13 steps, named node, suggested default instead of typing), `create:AiAgentThread` (8 steps, a page under another layout, a product suggestion instead of typing, the action lands on the result, a busy closing step that follows the streaming reply, then one look each at the answer, the chart and the rating controls), `manage:Dashboard` (14 steps, built with `suggest`/`check`/`smoke`: a suggested dashboard name, two named picks, a dropdown that had to be kept clear of the button after it).

## Recipe

### 1. Find the surfaces

```bash
grep -rn "subject('<Subject>'\|'<action>', '<Subject>'" packages/frontend/src --include='*.tsx' | grep -v test
```

List every control the scope gates, with file and line. Pick the one end-to-end action a viewer could not do before; that control gets the action marker. Confirm the scope is in the trainee set: it must appear in `getTrainingProjectScopes()` (`packages/common/src/authorization/roleToScopeMapping.ts`) or the walkthrough can never run.

### 2. Choose the click path

From the homepage of the training copy to the control, through existing anchors where possible. Add anchors with hints only where the path has none. The hint is what the learner does there ("Open All Spaces", "Run the query"). If a step must pick one of many controls, use `[data-tour-value="..."]` with a label from step 3.

### 3. Attach the project's content

The walkthrough runs in a copy of the training project, so name what the learner will actually see:

```bash
python3 -c "import json;c=json.load(open('packages/backend/assets/playground/content.json'));print(c['space']);print([x['name'] for x in c['charts']]);print(c['dashboard']['name'])"
python3 -c "import json;print(sorted(e.get('name') for e in json.load(open('packages/backend/assets/playground/explores.json'))))"
```

Spaces, chart names, the dashboard, and explore names come from there. For a walkthrough that needs content the seed lacks (an agent, a tag), add it to the seed (Slice 1 of CS-207) rather than to the walkthrough; the Ask AI module needed an agent (`Jaffle analyst`, instruction naming customers, orders and payments) and on the dev instance it was created over the API until the seed carries it. On a real customer instance the same step reads the project's spaces, charts and agents over the API, so the module names that project's own content; the mechanism is identical. Content a product feature generates itself (an agent's suggested questions, a suggested chart name) is representative by construction: cite it by anchor, not by label, because it changes run to run.

### 4. Ground the copy in the docs

Find the feature's page in `mintlify-docs` (follow redirects in `docs.json`; `/guides/x` often points at `/explore/x`). Read the section under the heading you will cite and pick sentences: roles and purpose for the intro (step 1), the sentence naming the control for the action step, the sentence describing the outcome for the closing step. Lists and images are skipped by the generator; paragraphs are counted among prose only. If the docs do not say it, the step has no body; never write the sentence yourself and never put explanation into a label or hint. A sentence cited from the middle of a paragraph loses a leading connector such as "Either way, " (the list is `LEADING_CONNECTORS` in the generator); pick sentences that stand on their own otherwise.

### 5. Place markers, generate, check

Action marker beside its ability check; result marker on the surface that shows the change (both homepage variants if the surface is the homepage). Before writing hints and docs citations by hand, ask for proposals:

```bash
LIGHTDASH_DOCS_DIR=/path/to/mintlify-docs pnpm scope-tours:suggest -- --scope <scope>
```

It proposes a hint for every anchor on the scope's paths that has none (from the control's own text) and docs citations for a marker that cites none (sentences that mention the label). Accept them as attributes, then:

```bash
LIGHTDASH_DOCS_DIR=/path/to/mintlify-docs pnpm scope-tours:generate
LIGHTDASH_DOCS_DIR=/path/to/mintlify-docs pnpm scope-tours:check
pnpm -F frontend typecheck
```

The checker enforces the rules above (`scripts/scope-tours/check.ts`; it also runs on every PR that touches the frontend or the generator): unknown scopes, anchors without hints, docs anchors that do not exist or sentences out of range, read steps with no docs sentence, titles over 12 words, bodies over 60, typed steps, missing result markers, homepage markers missing from one variant, unknown routes, an interactive last step. Fix what it reports; do not argue with it in the marker.

### 6. Prove it with a recorded flow

First the generic driver, which needs no flow: it starts every generated tour on the running instance and completes it by clicking only what the tour highlights.

```bash
SMOKE_SCOPES=<scope> pnpm scope-tours:smoke
```

It fails when a step makes no progress, when the tour ends anywhere but the shared training project, or when the learner already holds the scope in a real project. A walkthrough that needs anything the driver cannot do (a click outside the highlight) is wrong by definition. The same driver runs nightly over every tour.

Then the recorded flow, which proves what the driver cannot see (the change exists in the copy and not in the shared project, the real project refuses the action). Copy `~/.claude/scripts/verify-recorder/flows/cs-207-chart-tour.mjs` to `cs-207-<scope>-tour.mjs`. The flow plays the learner: starts the tour from the shared training project, asserts it landed in a fresh copy, and at each step waits for the control, checks the ring is on it (`spotlightOn`), clicks it, and waits for the next step number. It must also assert: the change exists in the copy and not in the shared project; the result surface shows it; Got it removes the copy; the same action is refused in the real project (HTTP 403). Run with `node record.mjs flows/<file>.mjs` from the recorder directory; every check must be green.

### 7. Report and record

Mark the walkthrough's child issue under CS-212 Done, with: scopes, the click path, docs anchors, step count, anchors added, the flow file, and anything the module taught the generator. Update the catalogue table on CS-212. Commit as one branch on the CS-207 stack.

## Gotchas

- Pages under a layout other than `ProjectLayout` (Ask AI lives under `AiAgentsRootLayout`) need `ScopeTourHost` mounted in that layout too; the host keeps the step reached in session storage, so the tour resumes across the remount (and a reload).
- Check the backend enforces the scope before promising a 403 in the flow: `create:AiAgentThread` is granted per role but thread creation is gated on `view:Project` plus the agent's access lists, so a viewer can start a thread in the real project. The flow then asserts the scope's absence from the viewer's ability and records the gap.
- A dropdown that stays open after a pick (a multi-select) can cover the next control; a click at the ring then hits the list. Give the container room for the open list rather than closing it for everyone (`AddChartTilesModal`).
- A named-pick anchor with a computed value (`data-tour-value={option.label}`) must put `data-tour-hint` before it: the generator reads the element's attributes up to the first `}`.
- Menus close on outside clicks; the tour's blockers already swallow those. Escape still closes them.
- A control measured while its menu animates open makes the ring chase; the kit waits for it to hold still, so do not add sleeps in flows shorter than 1.3 s before asserting the ring.
- A single-select tree keeps its selection on re-click (fixed); name the node you want anyway.
- An element can be both a path anchor and a walkthrough's action marker (All Spaces is the `all-spaces` anchor for other tours and the action of `view:Space`); the hint serves the paths, the label serves the action.
- A Foundations scope (one a viewer already holds) still needs an action: pick the click the docs name (the date zoom, the Results heading, All Spaces) and put the docs sentence on it. The flow then checks the scope is held in both projects instead of a 403.
- A control the docs never name cannot be a step (rule 6). The space page's Dashboards/Charts filter is one; leave it out and note the docs gap on the ticket.
- A prebuilt data app goes into the bundle as `dataApps` (name, slug, description, prompt, built `files` such as `index.html`, and `source` files); the seeder stores the files in the app runtime's bucket under the version prefix and creates a ready version, so no sandbox build runs. Previews (training copies included) already duplicate a project's apps and their files. The dev instance needs `APPS_RUNTIME_ENABLED=true` and the `enable-data-apps` flag.
- Content a walkthrough needs (a pin, a comment, a category) goes into the playground bundle (`content.json`: `pinned`, `comments`, `categories`, `dataApps`, `agent`, `deepResearch`) and is seeded by `seedPlaygroundContent`; a finished deep research run (thread + prompt + run + events) is copied into each training copy by `ProjectModel.copyDeepResearchForTrainingCopy`, re-owned to the learner because previews copy agents but not threads; a training copy carries pins and categories over (`duplicateContent`) and indexes its catalog on creation, while comments follow the tile uuid, which copies keep. On the dev instance, an existing training project is topped up with a throwaway script rather than re-provisioned.
- A control that only appears on hover (a tile's speech bubble) cannot be a target. TileBase now keeps the header pill shown for `visibleHeaderElement` content, which is what the docs promise for commented tiles.
- A result marker's target may be absent at step 1 (nothing pinned yet); the card centres and the step still works.
- `@lightdash/common` must be built (`pnpm -F common build`) for the generator to read the scope registry.
- A paragraph with no closing punctuation at all (the docs' one-line steps) is one sentence to the generator; cite it as `:1`.
- A paragraph that ends with a colon (a lead-in to a list or an image) has no sentences for the generator; cite prose that stands on its own. A dot inside a word (`table_name.field_name`) does not end a sentence.
- A typed anchor whose field is a Monaco editor (the SQL runner) attaches `tourEditor = { getValue, setValue }` to the anchor element on mount (`TourEditable` in GuidedTour.tsx); the kit fills and reads through it, and typing still bubbles `input` events to the anchor.
- A typed anchor may be an Ace editor (the SQL of a table calculation): the kit fills and reads it through the editor Ace keeps on its container (`env.editor`), so the anchor goes on the editor's wrapper.
- The tour's closing navigations (Got it, Back to library, Next) carry `LEAVING_COPY_STATE` router state; the chart and dashboard editors' unsaved-changes guards let it through (`isLeavingTrainingCopy`). A walkthrough that ends in another editor with a `useBlocker` guard needs the same check, or the copy is removed under a blocked page and the learner bounces.
- The tables list (New > Chart) is virtualised and grouped: a table far down it, or one inside a collapsed section (virtual views sit under "Virtual Views"), is reached by typing in `explore-search` and clicking `explore-section` by label. `data-tour-then` may carry a whole path after the action, typed steps included.
- A product feature that creates something but leaves the learner where they were (a virtual view, with a toast) needs the tour to walk to where the result shows, and the app must refresh the cached list on the way (the create hook now invalidates every explore list).
- The explore sidebar's tree is virtualised: a section header or node below the fold (the Custom dimensions section) is not on the page, so it cannot be a target. The Selected list at the top renders its own rows (`SelectedFieldRow`, not `TreeSingleNode`); a result that is a selected field goes there.
- A scope may gate less than its name suggests: `manage:CustomFields` gates custom SQL dimensions only (bins are open to viewers), `manage:CustomSqlTableCalculations` the SQL editor only (quick calculations, templates and formulas are open). The walkthrough must do the gated thing, or the real project will not refuse it.
- Run smokes and flows as `walkthrough-recorder@lightdash.com` (`SMOKE_EMAIL`, `CS207_FLOW_EMAIL`), never as an account a person is testing with: starting a tour removes that account's current copy. `SMOKE_DEBUG=1` prints every page the driver reached, every step, and every non-GET request. A copy left by a failed run is removed before each start.
