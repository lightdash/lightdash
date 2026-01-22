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

## Available Scripts

In the `packages/sdk-test-app` directory, you can run:

- `pnpm dev`: Starts the Vite development server (alias for `vite`).
- `pnpm start`: Runs `vite serve`.
- `pnpm build`: Builds the application for production.
