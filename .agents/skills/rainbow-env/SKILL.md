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

With `GOOGLE_SHEETS_DEV_REFRESH_TOKEN` set, the seeded admin can sync to Sheets on any new preview. The development seed adds the grant; forks inherit it. To connect Google in the UI, use `gsheets`, `gsheets-2` or `gsheets-3` and only the shared test account.

To rotate, sign in as the seeded admin on `gsheets`, open `/api/v1/login/gdrive`, and reconnect the test account. Ask a Rainbow operator to run this on the Rainbow host in Bash. Set `gsheets_env_id` to the ID for `gsheets` from `rainbow ls`. Keep the pipe intact: agents must never fetch or pass the token through MCP `exec`, `set_env` or chat.

```bash
set -o pipefail
rainbow exec "$gsheets_env_id" "$(cat <<'GUEST'
systemd-run --quiet --pipe --wait --collect -p EnvironmentFile=/etc/lightdash.env -p EnvironmentFile=-/run/rainbow/secrets.env --working-directory=/usr/app/packages/backend /usr/local/bin/node --import tsx -e '
const {SEED_ORG_1_ADMIN}=require("@lightdash/common"), {lightdashConfig}=require("./src/config/lightdashConfig.ts"), {EncryptionUtil}=require("./src/utils/EncryptionUtil/EncryptionUtil.ts"), db=require("knex")(require("./src/knexfile.ts").default.development);
(async()=>{let token; try {const grant=await db("user_oauth_grants").where({user_uuid:SEED_ORG_1_ADMIN.user_uuid,provider:"google"}).whereNot("provider_subject","rainbow-sheets-test").first("encrypted_refresh_token"); if(!grant) throw Error(); token=new EncryptionUtil({lightdashConfig}).decrypt(grant.encrypted_refresh_token);} finally {await db.destroy();} if(!token) throw Error(); process.stdout.write(token);})().catch(()=>{console.error("Could not export the connected Google grant");process.exitCode=1;});
'
GUEST
)" | rainbow secrets set -repo lightdash/lightdash GOOGLE_SHEETS_DEV_REFRESH_TOKEN
```

Let Rainbow restart services, then recreate previews that still have the old token.

**Treat the token as public.** `GET /api/v1/gdrive/get-access-token` accepts API-key auth and returns a raw Google bearer token. `spreadsheets` covers every sheet the test account can open. `drive.file` covers files this client created, including sharing them. Anyone with the access token can revoke the grant and break every preview's sync. Use only test data. Rotation is not revocation: remove the app's access in Google to revoke a leaked grant. Removing the Rainbow secret does not delete existing rows.

For the Picker, allow `https://*.lightdash.rainbowmachine.dev/*` and `https://docs.google.com/*` in the [key's website restrictions](https://developers.google.com/workspace/drive/picker/guides/web-picker#create_an_api_key). API syncs with a spreadsheet ID do not need the Picker. On a replacement OAuth client, register `https://<env>.lightdash.rainbowmachine.dev` as a JavaScript origin and `/api/v1/oauth/redirect/google` on that origin as a redirect URI for each fixed host before reconnecting.
