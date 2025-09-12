# Lightdash Iframe Test App

A React application for testing embedded Lightdash dashboards and monitoring postMessage events. This tool helps developers verify iframe embedding functionality and debug event communication between parent applications and embedded Lightdash content.

## Features

- **Live Event Monitoring**: Real-time display of postMessage events from embedded dashboards
- **Event Filtering**: Filter events by type (filterChanged, tabChanged, error, etc.)
- **Security Validation**: Origin checking for secure postMessage handling
- **Event History**: Persistent log of all received events with timestamps
- **Environment Documentation**: Built-in setup instructions for Lightdash server configuration

## Quick Start

### 1. Install and Run

```bash
cd packages/iframe-test-app
pnpm install
pnpm dev
```

The app will be available at `http://localhost:5173`

### 2. Configure Lightdash Server

Before testing, ensure your Lightdash server has the required environment variables. These can be in your `.env.development.local` file.

```bash
# Enable iframe embedding (requires Enterprise license)
EMBEDDING_ENABLED=true

# Enable event system
EMBED_EVENT_SYSTEM_ENABLED=true

# Enable postMessage events
EMBED_EVENT_SYSTEM_POST_MESSAGE_ENABLED=true

# Configure allowed domains (include this test app's domain)
LIGHTDASH_IFRAME_EMBEDDING_DOMAINS=http://localhost:5173,https://your-app-domain.com

# Optional: Rate limiting configuration
EMBED_EVENT_RATE_LIMIT_MAX_EVENTS=10
EMBED_EVENT_RATE_LIMIT_WINDOW_MS=1000
```

### 3. Generate Embed URLs in Lightdash

#### Method 1: Dashboard Settings (Recommended)

1. **Open your dashboard** in Lightdash
2. **Click the "..." menu** in the top right corner
3. **Select "Embed"** from the dropdown menu
4. **Configure embed settings**:
   - Set expiration time (optional)
   - Configure user attributes for data filtering (optional)
5. **Copy the generated embed URL**

### 4. Test the Integration

1. **Enter your embed URL** in the test app (e.g., what you generated and copied from the earlier step)
2. **Set target origin** to match your app (in this case its `http://localhost:5173`)
3. **Click "Load Iframe"** to embed the dashboard
4. **Interact with filters** in the embedded dashboard
5. **Monitor events** in the Event Monitor panel

## Security Considerations

- **Origin Validation**: The app validates that postMessage events come from the expected Lightdash server origin
- **Target Origin**: Always specify the correct target origin to prevent unauthorized message interception
- **Domain Allowlist**: Configure `LIGHTDASH_IFRAME_EMBEDDING_DOMAINS` to restrict which domains can embed your content

## Troubleshooting

### No Events Received

1. **Check environment variables** - Ensure `EMBED_EVENT_SYSTEM_ENABLED=true` and `EMBED_EVENT_SYSTEM_POST_MESSAGE_ENABLED=true`
2. **Verify domain configuration** - Make sure your app's domain is included in `LIGHTDASH_IFRAME_EMBEDDING_DOMAINS`
3. **Check origin matching** - Ensure the target origin exactly matches your Lightdash server's origin

### Embed URL Not Loading

1. **Verify embedding is enabled** - Check `EMBEDDING_ENABLED=true` on your Lightdash server
2. **Check Enterprise license** - Embedding requires an Enterprise license for self-hosted instances
3. **Validate URL format** - Ensure the embed URL follows the correct format: `https://your-lightdash.com/embed/dashboard/{uuid}`
4. **Check network access** - Ensure your test app can reach the Lightdash server

### Events Not Filtered

1. **Interact with dashboard** - Events are only triggered by user interactions (filter changes, tab switches)
2. **Check rate limiting** - Verify you haven't exceeded the configured rate limits
3. **Browser devtools** - Check the browser console for any JavaScript errors

### Adding New Event Types

To monitor additional Lightdash events:

1. Update the event type documentation in `SetupInstructions.tsx`
2. Add type definitions to `types.ts` if needed
3. The event monitoring automatically detects any event prefixed with `lightdash:`

## Resources

- [Lightdash Embedding Environment Variables](https://docs.lightdash.com/self-host/customize-deployment/environment-variables#embedding)
- [How to Embed Lightdash Content](https://docs.lightdash.com/guides/how-to-embed-content#how-to-embed-content)
- [Lightdash API Documentation](https://docs.lightdash.com/references/api)
- [Lightdash Dashboard Documentation](https://docs.lightdash.com/get-started/exploring-data/dashboards)
