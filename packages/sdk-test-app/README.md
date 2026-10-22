# Lightdash SDK Test App

This is a Vite-powered React application designed to test and demonstrate the functionality of the Lightdash SDK.

## Prerequisites

Before running the test app, ensure you have installed all dependencies from the root of the Lightdash repository:

```bash
pnpm install
```

## Getting Started

### 1. Build Dependencies

The `sdk-test-app` depends on `@lightdash/sdk` and `@lightdash/common`. You should build these dependencies first. You can use the root script:

```bash
pnpm sdk-build
```

### 2. Start the Development Server

You can start the `sdk-test-app` using `pnpm` workspace commands:

```bash
pnpm -F @lightdash/sdk-test-app dev
```

Alternatively, navigate to the package directory and run it directly:

```bash
cd packages/sdk-test-app
pnpm dev
```

By default, the application will be available at `http://localhost:3002`.

## Using the App

Once the app is running in your browser:

1. Click the **Config** button in the top right corner.
2. Enter a Lightdash **Embed URL**.
   - An Embed URL typically looks like: `https://{{lightdash_instance}}/embed/{{dashboard_uuid}}#{{embed_token}}`
3. Click **Set URL**.
4. The app will automatically extract the `instanceUrl` and `token` from the provided URL to render the embedded components.
5. Open an example from the home page.

The examples currently include:

- `AI agent demo`
- `Content catalog hooks demo`
- `Metrics catalog demo`
- `Dashboard builder demo`
- `I18n demo`
- `Filters demo`
- `Palette UUID demo`
- `Analytics dashboard demo`

The content catalog example calls `useLightdashContent`. It uses the configured
embed token against the SDK-supported content endpoint. Prefer an `apiAccess`
embed token with `content.serviceAccountUserUuid`; existing service-account
write-action tokens are also compatible. Do not expose service account API
tokens in browser apps. `apiAccess` tokens are catalog/read API tokens; use an
embedded write-action JWT for save/create flows. The local
`generate-embed-token` helper creates a compatible URL.
In local development, the app proxies `/sdk-test-app-api/lightdash/*` to the
Lightdash instance from `VITE_EMBED_URL` so browser CORS does not hide SDK hook
behavior. Set `LIGHTDASH_PROXY_TARGET` to override that target.

The palette demo uses a select with three stable options:

- `Default dashboard colors`
- `Customer Segments Sunrise` (`53eac606-b655-4edc-a9e9-a702e2c68f63`)
- `Customer Segments Aurora` (`0150adb1-6aba-45b8-b8e6-1e24f6d6164c`)

In a real customer integration, palette UUIDs should come from:

- `Settings → Appearance`, using the `Copy UUID` action on a palette
- `GET /api/v1/org/color-palettes`, if your host app wants to load the choices dynamically

The local development environment includes two stable example UUIDs so the demo remains reproducible.

## Generating a Demo Embed URL

The test app includes a helper script that signs JWTs with the project embedding secret and prints ready-to-paste environment values.

```bash
pnpm -F @lightdash/sdk-test-app generate-embed-token
```

The script:

- loads your local Lightdash environment from the repo root
- finds the `Jaffle dashboard`
- reads or creates the project's embedding secret in the `embedding` table
- signs a 24 hour JWT for dashboard embed content
- signs a separate 24 hour JWT for AI-agent embed content when it finds an agent in the dashboard project
- signs a 24 hour metrics-catalog JWT with Explore and chart creation enabled
- prints `VITE_EMBED_URL="..."`, `VITE_METRICS_CATALOG_EMBED_URL="..."`, and `VITE_AI_AGENT_EMBED_URL="..."` values for `packages/sdk-test-app/.env.local`

To target a specific agent, set `AI_AGENT_UUID` or `AI_AGENT_NAME` before
running the generator.

## Analytics Dashboard Demo

The `Analytics dashboard demo` shows a host product page around one
embedded dashboard. The example page only holds the Lightdash SDK code: the
`Lightdash.Dashboard` component and the mapping from host filter values to
SDK `filters`. The host navigation, tabs and filter bar are placeholders in
`src/examples/analytics-dashboard/HostPlaceholders.tsx`. Host filters reach the
dashboard when you press **Apply**.

The dashboard uses the jaffle `subscriptions` model and three custom chart
types built for
[Chart Studio](https://docs.lightdash.com/visualizations/chart-studio):

- `rate-trend`: the cancellation rate with **Overall / By plan** buttons,
  series chips, a target line and a summary sentence.
- `breakdown-bars`: new subscriptions per month with **Overall / By ...**
  buttons and series chips.
- `composition-stack`: recurring revenue by plan as stacked bars, with a
  proportional summary bar, chips that show or hide a plan, and a total line.

Chart types run no queries, so the buttons regroup and filter the rows the
saved chart already returned. Each saved chart queries at the grain of the
month plus every breakdown dimension, and uses additive metrics.

The chart type sources live in `analytics-chart-types/`. Only each
manifest (`lightdash-app.yml`) and its authored `src/` files are committed.
The server rebuilds an upload against its chart type template, which supplies
`main.jsx` and the other template files. To preview one locally, scaffold a
chart type with `lightdash apps create --chart-type` and copy the committed
files over it.

Setup needs an Enterprise license, the `embedding` feature flag and the data
apps runtime (`SANDBOX_PROVIDER=docker` with the `lightdash-sandbox:local`
image locally). Build the CLI with `pnpm -F @lightdash/cli build`, then run:

```bash
pnpm -F @lightdash/sdk-test-app setup-analytics-dashboard
```

The script uploads the chart types and waits for their builds. If the
`Analytics` dashboard doesn't exist yet, it creates the three saved charts and
the dashboard in a `SDK analytics example` space. It then prints
`VITE_ANALYTICS_EMBED_URL` for `.env.local`. The token hides the built-in
filter bar and enables **Explore from here** in the tile menu.

Chart type tiles render in iframes served with `frame-ancestors 'self'
https://*`. A host on plain `http://localhost:<port>` is blocked, so the tiles
stay empty in a default local setup. Serve the test app and Lightdash from one
origin, for example a local proxy that sends `/api/*` to the backend and
everything else to this app, and point `VITE_ANALYTICS_EMBED_URL` at it.

## Available Scripts

In the `packages/sdk-test-app` directory, you can run:

- `pnpm dev`: Starts the Vite development server (alias for `vite`).
- `pnpm start`: Runs `vite serve`.
- `pnpm build`: Builds the application for production.
- `pnpm generate-embed-token`: Generates a demo embed URL using your local Lightdash data.
- `pnpm setup-analytics-dashboard`: Uploads the analytics chart types, creates the `Analytics` dashboard and prints its embed URL.
