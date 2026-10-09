import type { ComponentType } from 'react';
import type { EmbedConfigState } from '../hooks/useEmbedConfig';
import { AiAgentExamplePage } from './AiAgentExamplePage';
import { ChartExamplePage } from './ChartExamplePage';
import { ContentCatalogExamplePage } from './ContentCatalogExamplePage';
import { DashboardBuilderExamplePage } from './DashboardBuilderExamplePage';
import { ErrorHandlingExamplePage } from './ErrorHandlingExamplePage';
import { ExploreFromHereExamplePage } from './ExploreFromHereExamplePage';
import { FiltersExamplePage } from './FiltersExamplePage';
import { HostStylesExamplePage } from './HostStylesExamplePage';
import { I18nExamplePage } from './I18nExamplePage';
import { MetricsCatalogExamplePage } from './MetricsCatalogExamplePage';
import { MultipleEmbedsExamplePage } from './MultipleEmbedsExamplePage';
import { PaletteUuidExamplePage } from './PaletteUuidExamplePage';
import { ThemeExamplePage } from './ThemeExamplePage';
import { TokenRotationExamplePage } from './TokenRotationExamplePage';

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
            'Embed an AI agent using an AI-agent embed token scoped to the configured write space.',
        sourcePath: 'packages/sdk-test-app/src/examples/AiAgentExamplePage.tsx',
        component: AiAgentExamplePage,
    },
    {
        slug: 'metrics-catalog',
        path: '/examples/metrics-catalog',
        title: 'Metrics catalog demo',
        description:
            'Browse embedded metrics, preview a metric, and continue into Explore without leaving the host app.',
        sourcePath:
            'packages/sdk-test-app/src/examples/MetricsCatalogExamplePage.tsx',
        component: MetricsCatalogExamplePage,
    },
    {
        slug: 'chart',
        path: '/examples/chart',
        title: 'Chart demo',
        description:
            'Embed a single saved chart in view or edit mode and drill down without leaving the host app.',
        sourcePath: 'packages/sdk-test-app/src/examples/ChartExamplePage.tsx',
        component: ChartExamplePage,
    },
    {
        slug: 'explore-from-here',
        path: '/examples/explore-from-here',
        title: 'Explore from here demo',
        description:
            'Open a saved dashboard tile in Explore inside the embed, or hand it to the host with onExplore.',
        sourcePath:
            'packages/sdk-test-app/src/examples/ExploreFromHereExamplePage.tsx',
        component: ExploreFromHereExamplePage,
    },
    {
        slug: 'content-catalog',
        path: '/examples/content-catalog',
        title: 'Content catalog hooks demo',
        description:
            'List spaces, dashboards, and charts with useLightdashContent.',
        sourcePath:
            'packages/sdk-test-app/src/examples/ContentCatalogExamplePage.tsx',
        component: ContentCatalogExamplePage,
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
    {
        slug: 'token-rotation',
        path: '/examples/token-rotation',
        title: 'Token rotation demo',
        description:
            'Swap the token prop at runtime and watch which token each SDK request carries, without remounting.',
        sourcePath:
            'packages/sdk-test-app/src/examples/TokenRotationExamplePage.tsx',
        component: TokenRotationExamplePage,
    },
    {
        slug: 'error-handling',
        path: '/examples/error-handling',
        title: 'Error handling demo',
        description:
            'Receive SDK errors through onError and replace fatal failures with a host-owned error screen and retry.',
        sourcePath:
            'packages/sdk-test-app/src/examples/ErrorHandlingExamplePage.tsx',
        component: ErrorHandlingExamplePage,
    },
    {
        slug: 'host-styles',
        path: '/examples/host-styles',
        title: 'Host styles isolation demo',
        description:
            'A host page with its own element styles next to an embedded dashboard, plus a live readout of what the SDK adds to <html> and <body>.',
        sourcePath:
            'packages/sdk-test-app/src/examples/HostStylesExamplePage.tsx',
        component: HostStylesExamplePage,
    },
    {
        slug: 'multiple-embeds',
        path: '/examples/multiple-embeds',
        title: 'Multiple embeds demo',
        description:
            'A dashboard and a chart on the same page, each embedded with its own token.',
        sourcePath:
            'packages/sdk-test-app/src/examples/MultipleEmbedsExamplePage.tsx',
        component: MultipleEmbedsExamplePage,
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
