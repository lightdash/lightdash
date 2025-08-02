<summary>
The Embed provider enables secure embedding of Lightdash dashboards and charts in external applications. It manages JWT authentication, project context, filters, and navigation between embedded views while supporting content customization for white-label deployments.
</summary>

<howToUse>
Wrap your embedded application with the EmbedProvider to enable embed functionality:

```typescript
import { EmbedProvider } from '@/ee/providers/Embed/EmbedProvider';
import { useEmbed } from '@/ee/providers/Embed/useEmbed';

// In your app root
<EmbedProvider
    projectUuid="abc-123"
    filters={[
        {
            model: 'orders',
            field: 'status',
            operator: 'equals',
            value: 'completed',
        },
    ]}
    onExplore={({ chart }) => {
        // Handle navigation to explore view
    }}
    onBackToDashboard={() => {
        // Handle back navigation
    }}
>
    <YourEmbeddedApp />
</EmbedProvider>;

// In child components
const MyComponent = () => {
    const { embedToken, projectUuid, filters, onExplore } = useEmbed();
    // Use embed context as needed
};
```

The provider automatically extracts JWT tokens from URL hashes (e.g., `/embed/project-uuid#jwt-token`) and stores them securely in memory.
</howToUse>

<codeExample>

```typescript
// Embedding a dashboard with filters
<EmbedProvider
    projectUuid={projectUuid}
    filters={dashboardFilters}
    contentOverrides={{
        'common.explore': 'Analyze',
        'common.back_to_dashboard': 'Return',
    }}
>
    <EmbeddedDashboard />
</EmbedProvider>;

// Consuming embed context
function EmbeddedChart() {
    const { embedToken, onExplore, t } = useEmbed();

    return (
        <button onClick={() => onExplore({ chart: savedChart })}>
            {t('common.explore') || 'Explore'}
        </button>
    );
}

// Filter type structure
const filter: SdkFilter = {
    model: 'sales',
    field: 'region',
    operator: 'equals',
    value: 'North America',
};
```

</codeExample>

<importantToKnow>
- JWT tokens are extracted from URL hash fragments and immediately stored in memory for security
- The URL is cleaned after token extraction to prevent token exposure in browser history
- Project UUIDs from props and URL params must match or an error is thrown
- User abilities are automatically updated based on the embedded user's permissions
- The provider supports navigation between dashboard and explore views while maintaining context
- Content can be customized through language maps for white-label deployments
- Embed tokens contain permissions, user attributes, and expiration settings configured server-side
</importantToKnow>

<links>
@/packages/frontend/src/ee/pages/EmbedExplore.tsx - Embedded explore page implementation
@/packages/frontend/src/ee/features/embed/SettingsEmbed/EmbedUrlForm.tsx - Embed URL generation UI
@/packages/frontend/src/ee/features/embed/SettingsEmbed/EmbedCodeSnippet.tsx - Server-side code generation examples
</links>
