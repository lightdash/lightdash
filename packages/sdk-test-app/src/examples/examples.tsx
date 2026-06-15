import type { ComponentType } from 'react';
import type { EmbedConfigState } from '../hooks/useEmbedConfig';
import { AiAgentExamplePage } from './AiAgentExamplePage';
import { DashboardBuilderExamplePage } from './DashboardBuilderExamplePage';
import { FiltersExamplePage } from './FiltersExamplePage';
import { I18nExamplePage } from './I18nExamplePage';
import { PaletteUuidExamplePage } from './PaletteUuidExamplePage';
import { ThemeExamplePage } from './ThemeExamplePage';

export type ExampleDefinition = {
    component: ComponentType<{ embedConfig: EmbedConfigState }>;
    description: string;
    path: string;
    slug: string;
    sourcePath: string;
    title: string;
};

export const examples: ExampleDefinition[] = [
    {
        slug: 'ai-agent',
        path: '/examples/ai-agent',
        title: 'AI agent demo',
        description:
            'Embed an AI agent using a dashboard embed token with AI access scoped to the configured write space.',
        sourcePath: 'packages/sdk-test-app/src/examples/AiAgentExamplePage.tsx',
        component: AiAgentExamplePage,
    },
    {
        slug: 'dashboard-builder',
        path: '/examples/dashboard-builder',
        title: 'Dashboard builder demo',
        description:
            'Create a new embedded dashboard, add saved charts from the configured write space, and save layout changes.',
        sourcePath:
            'packages/sdk-test-app/src/examples/DashboardBuilderExamplePage.tsx',
        component: DashboardBuilderExamplePage,
    },
    {
        slug: 'i18n',
        path: '/examples/i18n',
        title: 'I18n demo',
        description:
            'The existing dashboard demo, plus chart rendering and dashboard-to-explore navigation with translated content overrides.',
        sourcePath: 'packages/sdk-test-app/src/examples/I18nExamplePage.tsx',
        component: I18nExamplePage,
    },
    {
        slug: 'filters',
        path: '/examples/filters',
        title: 'Filters demo',
        description:
            'A host-app select drives an SDK dashboard filter for customer first name.',
        sourcePath: 'packages/sdk-test-app/src/examples/FiltersExamplePage.tsx',
        component: FiltersExamplePage,
    },
    {
        slug: 'palette-uuid',
        path: '/examples/palette-uuid',
        title: 'Palette overrides demo',
        description:
            'A dashboard example that pins chart colors to a specific org palette UUID.',
        sourcePath:
            'packages/sdk-test-app/src/examples/PaletteUuidExamplePage.tsx',
        component: PaletteUuidExamplePage,
    },
    {
        slug: 'theme',
        path: '/examples/theme',
        title: 'Theme demo',
        description:
            'Switch the embedded dashboard between light and dark mode via the `theme` prop.',
        sourcePath: 'packages/sdk-test-app/src/examples/ThemeExamplePage.tsx',
        component: ThemeExamplePage,
    },
    // Future examples:
    // {
    //     slug: 'charts',
    //     path: '/examples/charts',
    //     title: 'Charts demo',
    //     description: 'Single chart and chart-only embed examples.',
    //     sourcePath: 'packages/sdk-test-app/src/examples/ChartsExamplePage.tsx',
    //     component: ChartsExamplePage,
    // },
    // {
    //     slug: 'explores',
    //     path: '/examples/explores',
    //     title: 'Explore demo',
    //     description: 'Explore embedding and drill-through examples.',
    //     sourcePath: 'packages/sdk-test-app/src/examples/ExploreExamplePage.tsx',
    //     component: ExploreExamplePage,
    // },
    // {
    //     slug: 'row-level-security',
    //     path: '/examples/row-level-security',
    //     title: 'Row-level security demo',
    //     description: 'A minimal example showing RLS behavior in action.',
    //     sourcePath:
    //         'packages/sdk-test-app/src/examples/RowLevelSecurityExamplePage.tsx',
    //     component: RowLevelSecurityExamplePage,
    // },
];
