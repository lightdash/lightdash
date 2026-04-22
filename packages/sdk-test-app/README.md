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

- `I18n demo`
- `Filters demo`
- `Palette UUID demo`

The palette demo uses a select with three stable options:

- `Default dashboard colors`
- `Customer Segments Sunrise` (`53eac606-b655-4edc-a9e9-a702e2c68f63`)
- `Customer Segments Aurora` (`0150adb1-6aba-45b8-b8e6-1e24f6d6164c`)

In a real customer integration, palette UUIDs should come from:

- `Settings → Appearance`, using the `Copy UUID` action on a palette
- `GET /api/v1/org/color-palettes`, if your host app wants to load the choices dynamically

The local development environment includes two stable example UUIDs so the demo remains reproducible.

## Generating a Demo Embed URL

The test app includes a helper script that signs a JWT with the project embedding secret and prints a ready-to-paste `VITE_EMBED_URL`.

```bash
pnpm -F @lightdash/sdk-test-app generate-embed-token
```

The script:

- loads your local Lightdash environment from the repo root
- finds the `Jaffle dashboard`
- reads or creates the project's embedding secret in the `embedding` table
- signs a 24 hour JWT for dashboard embed content
- prints a `VITE_EMBED_URL="..."` value for `packages/sdk-test-app/.env.local`

## Available Scripts

In the `packages/sdk-test-app` directory, you can run:

- `pnpm dev`: Starts the Vite development server (alias for `vite`).
- `pnpm start`: Runs `vite serve`.
- `pnpm build`: Builds the application for production.
- `pnpm generate-embed-token`: Generates a demo embed URL using your local Lightdash data.
