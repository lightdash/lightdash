---
name: hydra
description: Live data source integrations, through their spec and use cases. Modes are view, assess <tool>, test <integration> and add. Use only when invoked as hydra.
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Glob, Grep, Bash
---

# hydra

Every live integration carries a spec on its definition: `level`, `auth`, `paging`, `rateLimiting` and `useCases`. The types are in `packages/backend/src/services/QuerySourceService/live/spec/types.ts`, and each integration's use cases are in `integrations/<name>/useCases.ts`. Each use case says whether it is `possible` today. Cases that span tools are in `spec/crossToolUseCases.ts`.

Every mode ends with an HTML page in `~/.hydra/`. Give the user its path. `hydra.sh` is in this folder; run it from anywhere in the checkout:

- `hydra.sh specs [integration]` prints the specs as JSON. Without an argument it prints all of them plus the cross-tool cases.
- `hydra.sh view` writes `~/.hydra/view.html`.
- `hydra.sh render <page.json>` writes `~/.hydra/<mode>-<name>.html` from a page you wrote.

A page is `{ mode, title, summary?, integrations: [...] }`. Each integration has the same shape as `specs` prints: `name`, `label`, `level`, `auth`, `paging`, `rateLimiting`, `useCases`. Write the JSON to the scratchpad, not into the repo.

## view

Run `hydra.sh view`. That's all.

## assess <tool>

Decide whether a tool we don't have yet is worth an integration, and how hard it would be.

1. Read the vendor's API docs: what it answers by itself, how you get in, how it pages, and its rate limits. Read two or three existing specs for the bar.
2. Write the use cases a customer would expect, and mark each `possible` for the integration you'd build.
3. Sketch the explores it would offer: for each, `name`, `label`, a one-line `description`, and the `dimensions` and `metrics` the API returns natively (`{ name, description? }`). Group fields the way the API groups its reports or objects; leave out anything we would have to compute.
4. Write a page with one integration, `mode: "assess"`. The spec fields are as you'd write them, `name` is the would-be connector id, `explores` is the sketch from step 3, and `verdict` weighs value against effort:
   - `value`: `high`, `medium` or `low`, with a reason of a few words. Judge it by how many use cases are possible and how often customers ask for the tool.
   - `effort`: `easy`, `medium` or `hard`, with a reason of a few words, on the same scale as integration tickets: auth and review, how many explores, and limits that need caching.
   - `points`: two to four short sentences, one point each.

   The page derives the call from the two: build now (high value, easy or medium effort; or medium value, easy effort), plan it (high and hard, or medium and medium), later (medium and hard, or low and easy), skip (low value, medium or hard effort).
5. Run `hydra.sh render <page.json>`.

## test <integration>

Check that the integration still answers what its use cases say. How far to go is up to you. A few cases on a connected instance are usually enough, but go deeper when something looks off.

- Run `hydra.sh specs <integration>`. Pick a handful of cases, mixing possible and not possible, and lean towards whatever recent changes touched.
- Ask them the way a customer would, on a local instance or a Rainbow Machine env with the integration connected. When a number matters, check it against the vendor directly.
- Judge each case against `possible`:
  - `pass` when it matches.
  - `regression` when a possible case fails.
  - `flip` when an impossible case now works; flip it in `useCases.ts`.
  - `blocked` when you couldn't try it, with the reason.
- Add `results: { <case id>: { outcome, note? } }` to the integration from `specs`, set `mode: "test"`, and render it. A note says what happened, in a line.

Fix nothing in this mode, except to flip `possible`. Report regressions to the user.

## add

Add a new integration. Follow [add.md](add.md).

## Rules

- Live integrations return only what the vendor's API computes natively.
- Say "live data source" and "integration", never "connection".
- Specs and use cases hold vendor facts only. They name no customers and link no tickets.
- `auth.testWith` is `test_account`, `real_account`, `paid_account` or `unknown`.
