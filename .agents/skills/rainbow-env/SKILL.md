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
- Live data sources: previews have Hydra, a test integration that needs no credentials or egress. How to add and drive one: `packages/backend/src/services/QuerySourceService/live/integrations/hydra/AGENTS.md`.

## Exports

Image and PDF exports, chart images and deliveries with images use the `headless-browser` service: browserless, the version production runs, on `localhost:3001`. It loads the app from `http://localhost:8080`. Read its log with `logs` and service `headless-browser`; the backend logs captures in `dev`.

- Dashboard image or PDF: the UI's export menu, or `POST /api/v2/dashboards/<uuid>/exports?projectUuid=<uuid>` with `{"format": "image"}` or `{"format": "pdf"}`. Poll `GET /api/v1/schedulers/job/<jobId>/status` until `completed`. `results.details.url` is the file: an env URL for images, a presigned bucket URL for PDFs.
- Chart image: `POST /api/v1/saved/<chartUuid>/export` returns the image URL.
- Scheduled delivery: create one with an email target (any address), then "Send now" in the UI or `POST /api/v1/schedulers/<schedulerUuid>/send`. Mailpit keeps the mail inside the guest: `curl localhost:8025/api/v1/messages`, then `curl localhost:8025/api/v1/message/<ID>` for its HTML. The image in the mail is a link to the env URL.
- A page asset from a host outside `[[egress.allow]]` is refused, so a Loom tile exports blank.

## Verify

UI proof is the real product on the env with seed data: open the env URL in a browser on your side. Storybook is for exploring variants; label any Storybook capture as such. Prefer text snapshots; screenshot only for visual checks, at device scale 1, cropped to the element.

Done when every claim you report names the env, the commit it served (`list_envs` sha), and the artifact (snapshot, screenshot, response, log line) that shows it.

## Guest limits

- `exec` stdout is clipped at 64 KB: write large output to a file and read it in slices.
- The guest cannot reach its own public URL. To pull a file out, write it under `packages/frontend/build/<dir>/`, fetch it from the env URL, then delete it.

## Google Sheets

When `GOOGLE_SHEETS_TEST_REFRESH_TOKEN` is set, the seeded admin can sync to Sheets on new PR, branch and fork previews without connecting Google. The backend start hook seeds the parent before Rainbow snapshots it. PR and branch previews inherit that database; forks copy their source's database. The hook also runs after secret injection, without a full database seed. If it fails, the backend still starts. Recreate previews that still have an old token from the current parent.

Use only the shared Google test account from the team password manager. Google accepts only that account for this client. Never connect your own account or share real data with the test account. **Treat the token as public.** `GET /api/v1/gdrive/get-access-token` accepts API-key auth and returns a raw Google bearer token. The `spreadsheets` scope covers every sheet the test account can open. The `drive.file` scope covers files this client created, including sharing them. Anyone with the access token can revoke the grant and break sync on every preview.

- **Picker:** In Google Cloud, add `https://*.lightdash.rainbowmachine.dev/*` and `https://docs.google.com/*` to the picker key's [website restrictions](https://developers.google.com/workspace/drive/picker/guides/web-picker#create_an_api_key). The picker receives an access token from Lightdash, so preview hosts do not need OAuth JavaScript origins. The sync API accepts a spreadsheet ID without a picker or API key.
- **Reconnect and rotate:** Replace the token when a sync fails with `invalid_grant`, or to rotate it on purpose. Sign in as the seeded admin on `gsheets` and open `/api/v1/login/gdrive`. Connect only the shared test account and grant only the Sheets flow's permissions. Only `gsheets`, `gsheets-2` and `gsheets-3` have registered redirect URIs for reconnecting. With this revision deployed to `gsheets`, a Rainbow operator runs `bash scripts/rainbow/refresh-google-grant.sh <gsheets-env-id>` on the Rainbow host. The script checks that Google accepts the grant inside the guest and passes the refresh token to `rainbow secrets set` on stdin. Use the operator CLI, not MCP `exec`, `set_env` or a pasted token. Wait for the new parent before recreating affected previews.
- **Switch OAuth clients:** Store the new OAuth client pair and Picker key in Rainbow, then recreate `gsheets`. Reconnect the shared account with the new client, then run the rotation script. Previews that load the new client cannot sync until they get the new grant. Recreate affected previews after the new parent is ready.
- **Revoke access:** Rotation is not revocation. Treat a leaked refresh token as usable until you remove the app's access in the Google account. Removing the Rainbow secret leaves the seeded row in an existing parent and its forks.
- **Verify:** Test with a new spreadsheet containing only test data. For charts above 5,000 rows, use `set_env` to raise `LIGHTDASH_QUERY_MAX_LIMIT` on your test preview. Check the `dev` log and `egress` if a sync fails. Delete the test preview when done.
