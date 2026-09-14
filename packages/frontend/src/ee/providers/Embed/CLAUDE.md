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
// Embedding a dashboard with translations:
// - contentOverrides is a slug-keyed LanguageMap (chart/dashboard content)
// - uiOverrides is a flat UiStringKey→string map (UI chrome: filters,
//   date zoom, tile menus)
<EmbedProvider
    projectUuid={projectUuid}
    filters={dashboardFilters}
    contentOverrides={languageMap}
    uiOverrides={{
        'tileMenu.exploreFromHere': 'Analyser',
        'filters.apply': 'Appliquer',
    }}
>
    <EmbeddedDashboard />
</EmbedProvider>;

// Consuming a UI string in a shared component: NEVER call t() directly with
// an inline fallback. Use useUiStrings — it resolves override ?? the English
// default from DEFAULT_UI_STRINGS (packages/common/src/utils/i18n/uiStrings.ts)
// and works outside embed contexts too.
function SomeSharedComponent() {
    const getUiString = useUiStrings();
    return <button>{getUiString('tileMenu.exploreFromHere')}</button>;
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
- UI chrome strings are translated via the `uiOverrides` prop: `t()` on the context looks up a `UiStringKey` in it, and `useUiStrings()` adds the English-default fallback. `t()` resolves at a single point in the provider so a future direct-embed transport can add its source there. Shipped `UiStringKey`s are a public SDK contract — additive only, never rename or remove. See `packages/frontend/src/components/common/Filters/CLAUDE.md` for the full mandate on adding strings.
- Embed tokens contain permissions, user attributes, and expiration settings configured server-side
</importantToKnow>

<links>
@/packages/frontend/src/ee/pages/EmbedExplore.tsx - Embedded explore page implementation
@/packages/frontend/src/ee/features/embed/SettingsEmbed/EmbedUrlForm.tsx - Embed URL generation UI
@/packages/frontend/src/ee/features/embed/SettingsEmbed/EmbedCodeSnippet.tsx - Server-side code generation examples
</links>
