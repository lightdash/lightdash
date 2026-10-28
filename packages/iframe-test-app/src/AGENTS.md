# Iframe Test App

<summary>
A React application for testing Lightdash embedded dashboards and monitoring postMessage events. Provides a comprehensive testing environment to verify iframe embedding functionality and event communication between parent and child windows.
</summary>

<howToUse>
Start the test app and configure it to test your embedded Lightdash dashboards:

1. Run the development server: `pnpm dev` from the iframe-test-app directory
2. Enter your Lightdash embed URL (e.g., `http://localhost:3000/embed/dashboard/uuid`)
3. Set the target origin (defaults to `http://localhost:5173` for this app)
4. Click "Load Iframe" to embed the dashboard
5. Interact with filters in the embedded dashboard to see events in the Event Monitor

The app automatically listens for postMessage events from the embedded iframe and displays them in real-time with filtering and history capabilities.
</howToUse>

<codeExample>

```typescript
// Key interfaces for event handling
interface LightdashEmbedEvent {
    type: string;           // Event type (e.g., 'lightdash:filterChanged')
    payload: Record<string, unknown>;  // Event-specific data
    timestamp: number;      // When the event was dispatched
}

interface EventLogEntry {
    id: string;            // Unique identifier for the log entry
    timestamp: Date;       // When the event was received
    event: LightdashEmbedEvent;  // The actual event data
}
```

Component architecture:
```typescript
// Main app component
<App />
  ├── EventMonitor        // Event display and filtering
  └── SetupInstructions   // Environment configuration docs
```
</codeExample>

<importantToKnow>
**Environment Setup Required**: The backend Lightdash server must have these environment variables configured for events to work:
- `EMBEDDING_ENABLED=true` - Enable iframe embedding
- `EMBED_EVENT_SYSTEM_ENABLED=true` - Enable event system
- `EMBED_EVENT_SYSTEM_POST_MESSAGE_ENABLED=true` - Enable postMessage events

**Security**: The app validates postMessage origins to ensure events only come from the expected Lightdash server. The targetOrigin parameter is automatically added to embed URLs for security.

**Event Types**: Monitors for events prefixed with `lightdash:` including:
- `lightdash:filterChanged` - Dashboard filter modifications
- `lightdash:tabChanged` - Tab navigation
- `lightdash:allTilesLoaded` - Dashboard fully loaded
- `lightdash:error` - Error events

**CSS Architecture**: Uses CSS modules with centralized design tokens in `variables.css` for consistent styling across components.
</importantToKnow>

<links>
- Main app component: @App.tsx
- Event monitoring component: @components/EventMonitor.tsx
- Documentation component: @components/SetupInstructions.tsx
- Type definitions: @types.ts
- Design system: @variables.css
- Lightdash embed event system: @/packages/frontend/src/ee/features/embed/events/LightdashUiEvent.ts
- Dashboard provider event emission: @/packages/frontend/src/providers/Dashboard/DashboardProvider.tsx
</links>