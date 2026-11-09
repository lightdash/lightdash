# Slack app: local development

How to run the Slack integration (the AI agent `@mention` bot, link unfurls and Slack deliveries) against a local Lightdash instance.

The backend talks to Slack in **socket mode** when `SLACK_SOCKET_MODE=true`. Slack sends events over an outbound WebSocket that the backend opens, so mentions and button clicks reach a laptop with no public URL. Only one step needs a public HTTPS URL: the one-time OAuth install, because Slack redirects the browser to `${SITE_URL}/api/v1/slack/oauth_redirect`. Links in agent replies (chart links, the **Connect agent** button) also use `SITE_URL`, so they open only where that host resolves.

Code: `packages/backend/src/clients/Slack/SlackClient.ts` (`start`, `getSlackOptions`), config in `packages/backend/src/config/parseConfig.ts` (`slack`).

## 1. The Slack app

Use a Slack app that belongs to you or the team for development. Never use the production app. In the app settings at https://api.slack.com/apps:

- **Socket Mode**: on. Create an app-level token with the `connections:write` scope. It starts with `xapp-`.
- **OAuth & Permissions**: add the redirect URL `https://<your-tunnel-host>/api/v1/slack/oauth_redirect`. Add the bot scopes from `SlackClient.getRequiredScopes()`.
- **Event Subscriptions**: on, with the bot events `app_mention`, `message.channels`, `message.groups`, `message.im` and `link_shared`. In socket mode Slack does not ask for a request URL.
- **Interactivity & Shortcuts**: on. Socket mode delivers button clicks too.
- **App unfurl domains**: add your tunnel host if you test link unfurls.

The shared dev app's values are in the Lightdash 1Password item "Slack ENV for lightdash share local", a secure note with an `export KEY=""value""` block. `scripts/dev-op-pull.sh pull SLACK_APP` writes them into `.env.development.local`. If you use your own app, copy the same keys from its settings pages.

## 2. Environment

Add these keys to the instance's `.env.development.local`:

```bash
SLACK_APP_TOKEN=xapp-...
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
SLACK_SIGNING_SECRET=...
SLACK_STATE_SECRET=...
SLACK_SOCKET_MODE=true
SITE_URL=https://<your-tunnel-host>
```

The agent also needs an LLM key (for example `OPENAI_API_KEY` with `AI_DEFAULT_PROVIDER=openai`) and an EE licence. Restart the backend after you change the file. The log line `Slack app initialized successfully` confirms the socket connection.

Never echo the values in a shell. Append them from a file you keep outside the repo (`cat <file> >> .env.development.local`), and remove them when you finish.

## 3. Public URL for the install

Point an HTTPS hostname at the instance's **frontend** port. Vite proxies `/api` to the backend, so one hostname serves both. Any tunnel works. A Cloudflare tunnel with a `*.lightdash.dev` hostname needs no Vite change, because `packages/frontend/vite.config.ts` already allows `.lightdash.dev` in `server.allowedHosts`. For another domain, set `FE_HOST` or add the host locally, and do not commit it.

When the tunnel routes to a fixed local port, forward that port to your instance's frontend port:

```bash
socat TCP-LISTEN:<tunnel-port>,fork,reuseaddr TCP:127.0.0.1:<frontend-port>
```

## 4. Install the app

1. Open `https://<your-tunnel-host>` and sign in. Always use the tunnel host, not `localhost`. The session cookie and the OAuth state must be on the same host as the redirect.
2. Go to **Organization settings → Integrations → Slack** and click **Add to Slack**. Slack shows the consent screen in the browser. Approve it.
3. Slack redirects to `/api/v1/slack/oauth_redirect`, and the installation is stored in `slack_auth_tokens`.
4. Invite the bot to a test channel: `/invite @<bot name>`.

## 5. Set up the AI agent

1. On the instance, create an AI agent for a project and add the test channel under its Slack integration.
2. In the channel, `@mention` the bot with a question. The reply streams into a thread.

Socket mode delivers an event to only one open connection per app token. If two instances use the same app token at the same time, each event goes to one of them at random. Use one running instance per app, or one app per developer.

## Profiles

`/docker-dev start ee,slack` uses the `slack` profile in `scripts/dev-profiles.json`. It pulls `SLACK_APP` from 1Password and sets `SLACK_SOCKET_MODE=true`. You still do steps 3 and 4 manually.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Missing "SLACK_CLIENT_ID", Slack App will not run` | The Slack keys are not in the env file the backend loads. |
| `Missing "SLACK_APP_TOKEN" to start Slack Client in socket mode` | `SLACK_SOCKET_MODE=true` with no app-level token. |
| Slack shows `redirect_uri did not match any configured URIs` | `SITE_URL` differs from the redirect URL on the app's OAuth page. |
| Vite shows "Blocked request. This host is not allowed" | The tunnel host is not in `server.allowedHosts`. |
| The bot does not answer a mention | The bot is not in the channel, the channel is not on an agent, or another instance holds the socket for the same app token. |
