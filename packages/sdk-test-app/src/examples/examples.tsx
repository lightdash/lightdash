import type { ComponentType } from 'react';
import type { EmbedConfigState } from '../hooks/useEmbedConfig';
import { FiltersExamplePage } from './FiltersExamplePage';
import { I18nExamplePage } from './I18nExamplePage';

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
