---
name: rainbow-env
metadata:
  internal: true
description: Interact with Rainbow Machine PR preview environments for Lightdash (`rainbow.toml`, rainbowmachine MCP). Use when an agent needs to create or redeploy a preview env, run commands or call the API or database inside one, or verify a change on it.
---

# Rainbow environments

`rainbow.toml` is the recipe: services, build tiers, `[env]`, egress. Read it when a step below needs a detail it doesn't give.

## Outside vs inside

Each env is a VM (the **guest**) running the dev stack in `/usr/app`. You reach it two ways:

- **Outside**, through the env URL: anything a user does (UI, API calls, screenshots). Requests pass the HTTPS ingress, as in production.
- **Inside**, through `exec`, `logs`, `verify`, `set_env`: anything only a server-side developer could do (database, logs, env vars, scripts against the live stack). `localhost` is the guest itself, over plain http.
- **Code** changes go through git only: push, then redeploy.

## Pick the env

- An open PR already has one: routing name `lightdash--pr-<N>`. Use it.
- Before/after: keep the PR env as "after"; `create_env({repo: "lightdash/lightdash", branch: "main", name: "lightdash-main-base"})` is "before".
- Any other pushed branch: `create_env({repo: "lightdash/lightdash", branch, name})`.

Tools take the routing name or env id as `env`.

## Redeploy

The env serves pushed commits only. To ship a change: push, then `create_env` with the same name; it updates in place at the same URL. Frontend, common, visualization or formula changes rerun the `frontend-build` tier, because 8080 serves the prebuilt bundle in `packages/frontend/build`, not the Vite dev server. `/usr/app` in the guest is not a git checkout.

A `create_env` that changes the dependency layer rebuilds the parent and takes minutes. A call that returns "still running", a task handle, or an error after a long wait is usually still working: check `list_envs`, then repeat the same call. Keep one env per name.

## Talk to the app

- API: authenticate with the seed PAT (`SEED_PAT` in `packages/common/src/index.ts`): `curl -H "Authorization: ApiKey $PAT" http://localhost:8080/api/v1/...` inside the guest, or the env URL from outside. Session login sets a secure cookie, so plain-http requests from the guest get none.
- Feature flags: the API in `docs/preview-feature-flags.md`. Config-derived flags (`ai-copilot` and friends) follow env vars instead.
- Env vars: `set_env` (restarts services, ~20 s); stored secrets come from `rainbow.toml` `[secrets]`.
- Database: `psql` in the guest with the `PG*` values from `rainbow.toml` `[env]`; `exec` does not load them for you.
- Logs: `logs` with service `dev`.
- Outbound calls fail by policy unless `rainbow.toml` `[[egress.allow]]` admits the host; `egress` lists what was refused.

## Verify

UI proof is the real product on the env with seed data: open the env URL in a browser on your side. Storybook is for exploring variants; label any Storybook capture as such. Prefer text snapshots; screenshot only for visual checks, at device scale 1, cropped to the element.

Done when every claim you report names the env, the commit it served (`list_envs` sha), and the artifact (snapshot, screenshot, response, log line) that shows it.

## Guest limits

- `exec` stdout is clipped at 64 KB: write large output to a file and read it in slices.
- The guest cannot reach its own public URL. To pull a file out, write it under `packages/frontend/build/<dir>/`, fetch it from the env URL, then delete it.
