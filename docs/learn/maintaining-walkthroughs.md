# Maintaining Learn walkthroughs

A Learn walkthrough is built from the product, so a product change can break one. This guide is for three readers: an engineer (or their coding agent) changing the UI, whoever sees `Scope walkthrough checks` fail on a pull request, and whoever picks up a report that a walkthrough is stuck. `architecture.md` explains how Learn works; `.claude/skills/add-scope-walkthrough` is the recipe for adding a walkthrough.

## Why a UI change can break a walkthrough

Each walkthrough step is a control in the product marked with `data-tour-*` attributes. `scripts/scope-tours/generate.ts` reads those attributes, plus sentences cited from the docs repository, and writes `packages/frontend/src/features/scopeTours/generated.ts`. The library order is generated the same way into `curriculum.ts`.

Two kinds of change can break a walkthrough:

- **Structural.** A marked control is deleted, renamed or loses its attributes in a refactor, or a click path names an anchor that no longer exists. `scope-tours-check.yml` catches these on every pull request that touches `packages/frontend/src`.
- **Behavioural.** Every attribute is still in place, but the learner can no longer reach the control by clicking what is highlighted: a new dialog or menu sits in the way, the control moved behind another click, it is disabled until something loads, or it only renders under some configuration. CI does not catch these. Only the smoke (`pnpm scope-tours:smoke`, below) does, and it runs by hand.

## Who fixes what

- **Your pull request** keeps `Scope walkthrough checks` green for failures your change caused. Most are fixed by putting an attribute back on the equivalent control or by regenerating the walkthroughs and committing the result.
- **The Learn owners** (Customer Success team, Linear project *Lightdash University*) own failures you did not cause (a docs page renamed upstream, a checker bug, CI setup) and any walkthrough that needs a new click path. Say so on your pull request and ask them; they fix it in a separate pull request against `main` and you rebase.
- **Never change product UI to make a walkthrough pass.** Adapt the walkthrough instead. For a control only some instances show, that means an optional hop (see *When a learner reports a stuck walkthrough*).

To tell whether you caused a failure, run the same command on `main`. If it fails there too, it is not yours.

## Before you open a pull request

1. **Check whether the component is in a walkthrough.**

    ```sh
    git grep -n 'data-tour-' -- path/to/Component.tsx
    ```

    No output means no walkthrough depends on it. If there is output, `data-tour-scope="..."` names the walkthrough that marks this component directly. A `data-tour-nav` or `data-tour-anchor` value may be used by other walkthroughs' click paths; list them with:

    ```sh
    awk -v s='data-tour-anchor="run-query"' '/^    .[a-z]+:[A-Za-z]+.: \{/ {scope=$1} index($0, s) {print scope}' \
      packages/frontend/src/features/scopeTours/generated.ts | sort -u | sed "s/^'//; s/':\$//"
    ```

2. **Keep the attributes on the equivalent control.** When you refactor, every `data-tour-*` attribute stays on the element a user clicks to do the same thing. When a control moves to another component, its attributes move with it. When you rename a `data-tour-nav` or `data-tour-anchor` value, update every path that names it (`git grep -n 'the-old-value' -- packages/frontend/src`). The two homepage components (`PinnedItemsPanel/index.tsx` and `DayOneHomepage.tsx`) carry the same result markers; change one, change both.

3. **Run the checks locally.** They read the docs from `../mintlify-docs` (a checkout of `lightdash/mintlify-docs` beside this repository) or from `LIGHTDASH_DOCS_DIR`.

    ```sh
    pnpm common-build            # if common is not built yet
    pnpm scope-tours:generate
    pnpm scope-tours:order
    pnpm scope-tours:check
    ```

    Commit any change to `generated.ts` and `curriculum.ts`. Read the diff: a step whose title or text changed is a change learners will see.

4. **If the click path changed, run the smoke** for the walkthroughs you found in step 1.

## Running the smoke

The smoke starts each walkthrough as a learner and completes it by clicking only what the walkthrough highlights. It needs a running instance with Learn on:

1. Add `enable-learn` to `LIGHTDASH_ENABLE_FEATURE_FLAGS` in `.env.development.local` and start the instance (`/docker-dev`). Rainbow previews enable the flag automatically.
2. As an organization admin, open Learn and press **Enable Learn** (or `POST /api/v1/org/training-project`). This creates the training project.
3. Run the smoke as a non-admin account. On the development seed that is the viewer, `demo3@lightdash.com`:

    ```sh
    SMOKE_BASE_URL=http://localhost:<frontend port> \
    SMOKE_EMAIL=demo3@lightdash.com SMOKE_PASSWORD='demo_password!' \
    SMOKE_SCOPES=manage:SavedChart,manage:CustomFields \
    pnpm scope-tours:smoke
    ```

Each walkthrough prints `PASS` or `FAIL` with a screenshot path. `SMOKE_DEBUG=1` prints each step reached, every page the app moved to and every request that changed something; `SMOKE_OUT_DIR` changes where screenshots go. Playwright comes from the backend package; install a browser with `pnpm -F backend exec playwright install chromium` if it has none.

- Starting a walkthrough deletes that account's current training copy. Do not run the smoke as an account someone is testing with.
- Enterprise walkthroughs (AI agents, data apps) need a licence, and data apps need their flag. Without them those walkthroughs stall on a control that is not rendered, so leave them out of `SMOKE_SCOPES` on a non-Enterprise instance.
- A walkthrough can behave differently on an instance configured differently from yours. If your change depends on configuration, run the smoke with that configuration too. For example, `AUTH_GOOGLE_OAUTH2_CLIENT_ID=x` and `GOOGLE_DRIVE_API_KEY=x` (any non-empty value) make the export menu show the Google Sheets option it shows on Cloud.

## When CI fails

`Scope walkthrough checks` (`.github/workflows/scope-tours-check.yml`) runs these steps in order. The first one that fails is the one to read.

**Docs checkout is complete.** The docs repository could not be checked out. This is CI setup, not your change: re-run the job, then ask the Learn owners.

**Build common.** An ordinary build error in `packages/common`. Fix it as you would anywhere else.

**Checker tests.** The generator's own tests (`scripts/scope-tours/scope-tours.test.ts`). They only fail when `scripts/scope-tours` changed. If you did not change it, ask the Learn owners.

**Playground teaching samples survive a bundle rebuild.** `scripts/playground-bundle/content.ts` and the shipped `packages/backend/assets/playground/content.json` differ. Walkthroughs rely on that seeded content, so the two must change together.

**Content coverage tests.** Tests for the coverage audit (`scripts/scope-tours/coverage.test.ts`). Same as the checker tests: yours only if you changed `scripts/scope-tours`.

**Every curriculum permission has a walkthrough or explicit disposition.** Every permission a training copy grants must either have a walkthrough or be listed as Coming Soon or excluded. The JSON output names the problem:

- `unclassified`: a permission with neither. This happens when you add a new scope to the project admin role (the trainee set derives from it) or delete the markers of an existing walkthrough. Add the scope to `COMING_SOON_SCOPES` in `packages/frontend/src/features/learn/comingSoon.ts`, or add an `excluded` entry with a reason and a `CS-` ticket to `SCOPE_DISPOSITIONS` in `scripts/scope-tours/coverage.ts`. Ask the Learn owners which one; a new permission is usually Coming Soon until it gets a walkthrough.
- `staleDispositions`: a listed scope now has a walkthrough or no longer exists. Remove the entry.
- `pending` or `related`: a listed gap that blocks a release. Ask the Learn owners.

**Generated tours are up to date.** Either the generator threw (the log names the file, selector or docs citation; see the table below), or `generated.ts` differs from what the markers and docs produce now. For a diff, run `pnpm scope-tours:generate` and commit. If the diff changes step text and you did not touch any `data-tour-*` attribute, the docs changed upstream; committing the regenerated file is fine.

**The teaching order is up to date.** `curriculum.ts` differs from what the docs produce now. Run `pnpm scope-tours:order` and commit. `No concept could be read from the title of` means a docs page title changed upstream; ask the Learn owners.

**Generation checks.** `pnpm scope-tours:check` found a rule broken. It prints `file:line: error: message`; warnings do not fail the job.

### Messages from the generator and the checker

| Message | Usual cause | What to do |
| --- | --- | --- |
| `selector [data-tour-anchor="x"] does not resolve to a data-tour-nav or data-tour-anchor in the frontend` | A control on a walkthrough's path lost its attribute, or its value was renamed | Put the attribute back on the equivalent control, or update the path that names it |
| `No data-tour-hint found for ...` / `... has no data-tour-hint` | An anchor kept `data-tour-anchor` but lost `data-tour-hint` in a refactor | Restore the hint; it is the step's title |
| `unknown scope ... in data-tour-scope` | A scope was renamed or removed from the registry | Update the marker to the new scope, or remove the walkthrough and add a disposition (above) |
| `data-tour-step N is defined differently in A and B` | A marked element was duplicated (copied component, second render branch) with different attributes | Make the copies identical, or keep the marker on one |
| `data-tour-route "..." is not a known project route` | A route in `Routes.tsx` or `CommercialRoutes.tsx` was renamed | Update `data-tour-route` to the new path |
| `the homepage result marker is missing from ...` | One homepage component changed and the other did not | Carry the same marker in both |
| `... is a typed field with no data-tour-suggest` | A text field on a path is new or lost its suggestion | Add `data-tour-suggest` (learners never have to invent input), or give the product a default |
| `title is over 12 words` | A `data-tour-label` or `data-tour-hint` grew | Shorten it |
| `Docs anchor not found: ...`, `paragraph N not found`, `sentence range out of bounds`, `list item N not found` | The cited docs section was renamed or edited upstream | Not yours unless you edited `data-tour-docs`; ask the Learn owners to re-cite |
| `docs page ... not found under ...` | Locally: no docs checkout, or `LIGHTDASH_DOCS_DIR` is wrong. In CI: a docs page moved | Fix the path locally; in CI ask the Learn owners |
| `body is over 60 words`, `Docs link off the docs site is not allowed` | A cited docs sentence grew or gained an outside link | Ask the Learn owners |
| Anything about result markers, looks, `data-tour-busy`, optional hops or the last step | Walkthrough authoring rules | See the `add-scope-walkthrough` skill, or ask the Learn owners |

## When the smoke fails

| Message | Meaning | What to do |
| --- | --- | --- |
| `no progress at step N of M ("title") for 90s` | The highlighted control never appeared, or clicking it did not move the walkthrough on. This is the usual result of a behavioural change | Open the screenshot. If something now sits in the way, the path needs that control added; if the control moved, move its attributes; if it is disabled until data loads, check it enables in the training copy |
| `tour closed at step N of M` | The walkthrough disappeared before its last step | Usually the page now renders under a layout that does not mount `ScopeTourHost`; mount it there (see the skill's gotchas) |
| `typed step "..." offers nothing to use` | A typed step has no suggestion at runtime | Add `data-tour-suggest` to the field |
| `ended on ..., not the library of the shared training project` | The closing navigation was blocked or redirected | Often an unsaved-changes guard that does not let the training copy's leaving state through (`isLeavingTrainingCopy`) |
| `the scope is not in the trainee set a training copy grants` | A permission change removed the scope from `getTrainingProjectScopes()` | Intended? Add a disposition. Not intended? Fix the scope mapping |
| `no training project in the org`, `did not land in a training copy`, `the learner cannot view the shared training project` | Instance setup, not a walkthrough problem | Enable Learn, check the account belongs to the org, and run `pnpm -F backend generate-api` if the Learn endpoints answer 404 on a fresh checkout |

## When a learner reports a stuck walkthrough

1. **Check the instance runs the code you think it does.** Compare `curl -s https://<instance>/api/v1/health | jq -r .results.version` with `git tag --contains <fix commit> | head -1`. Internal instances can lag `main` by days, so a fixed walkthrough can still be stuck there.
2. **Reproduce on an instance shaped like theirs.** Most stuck walkthroughs come from configuration: Google Drive, an Enterprise licence, a feature flag. Run the smoke for that one walkthrough with the same configuration.
3. **Adapt the path, not the product.** If the instance shows an extra control on the way, mark it with `data-tour-anchor` and `data-tour-hint` and add it to the path as an optional hop: a `?` after the selector in `data-tour-via`, `data-tour-then` or `data-tour-return`. The walkthrough then highlights it only when it is on the page. An optional hop cannot be the last one in `then` or `return`.
4. **Learners are not trapped meanwhile.** When the highlighted control does not appear within 15 seconds, the card comes back so the learner can skip the step.
