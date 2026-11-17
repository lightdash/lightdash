import {
    FeatureFlags,
    type ApiResponse,
    type ModelMaterializationStatus,
} from '@lightdash/common';
import { Group, Stack, Title } from '@mantine/core';
import { type Meta, type StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type FC } from 'react';
import { MemoryRouter } from 'react-router';
import { sharedLightdashApi, type LightdashApiProps } from '../api';
import { MaterializedBadge } from '../features/semanticStudio/ModelSourceCard';
import { ModelTabs } from '../features/semanticStudio/ModelTabs';
import { ModelMaterializationContext } from '../features/semanticStudio/useModelMaterialization';
import { LightdashApiContext } from '../providers/LightdashApi/LightdashApiContext';
import MantineBaseProvider from '../providers/MantineBaseProvider';

const project = 'demo';
const model = 'order_items';
const status: ModelMaterializationStatus = {
    state: 'materialized',
    servingCopy: true,
    asOf: '2026-11-17T09:12:00Z',
    rowCount: 18642,
    maxRows: 1000000,
    byteCount: 2593152,
    nextRefresh: null,
    failureReason: null,
};
const base = `/projects/${project}/semantic-studio`;
const modelUrl = `${base}/models/${model}`;
const componentFixtures = new QueryClient({
    defaultOptions: { queries: { cacheTime: Infinity } },
});
componentFixtures.setQueryData(['/health?skipMigrationCheck=true'], {
    preAggregates: { enabled: false },
});
componentFixtures.setQueryData(
    [`/feature-flag/${FeatureFlags.SemanticStudioEditing}`],
    { id: FeatureFlags.SemanticStudioEditing, enabled: true },
);
componentFixtures.setQueryData([`${base}/status`], {
    enabled: true,
    appliesAs: 'live',
});
componentFixtures.setQueryData([`${base}/draft`], { models: [] });
componentFixtures.setQueryData([modelUrl], {
    name: model,
    history: [],
    version: 1,
});
componentFixtures.setQueryData([`${modelUrl}/materialization`], status);
componentFixtures.setQueryData([`${modelUrl}/materialization/sample`], {
    columns: ['order_id', 'category', 'quantity', 'amount'],
    rows: [
        { order_id: 1017, category: 'Books', quantity: 2, amount: '32.00' },
        { order_id: 1018, category: 'Home', quantity: 1, amount: '48.90' },
        { order_id: 1019, category: 'Garden', quantity: 3, amount: '27.50' },
        { order_id: 1020, category: 'Home', quantity: 1, amount: '16.00' },
    ],
});
const fixtureApi = Object.assign(
    async <T extends ApiResponse['results']>({
        url,
        method,
    }: LightdashApiProps) => {
        const value = componentFixtures.getQueryData<T>([url]);
        if (method !== 'GET' || value === undefined)
            throw {
                error: { message: 'This action requires a connected project.' },
            };
        return value;
    },
    { ...sharedLightdashApi },
);

const PerformanceStory: FC<{ scheme: 'light' | 'dark' }> = ({ scheme }) => {
    const [client] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: { retry: false, staleTime: Infinity },
                },
            }),
    );
    return (
        <MantineBaseProvider forceColorScheme={scheme}>
            <QueryClientProvider client={client}>
                <LightdashApiContext.Provider value={fixtureApi}>
                    <ModelMaterializationContext.Provider
                        value={{ enabled: true, models: new Set([model]) }}
                    >
                        <MemoryRouter initialEntries={['/?view=performance']}>
                            <Stack
                                maw={920}
                                p="xl"
                                gap="md"
                                bg="var(--mantine-color-body)"
                            >
                                <Group gap="sm">
                                    <Title order={3}>Order items</Title>
                                    <MaterializedBadge model={model} />
                                </Group>
                                <ModelTabs
                                    projectUuid={project}
                                    modelName={model}
                                    exploreName={model}
                                    fields={null}
                                />
                            </Stack>
                        </MemoryRouter>
                    </ModelMaterializationContext.Provider>
                </LightdashApiContext.Provider>
            </QueryClientProvider>
        </MantineBaseProvider>
    );
};
const meta = {
    title: 'Semantic Studio/Model Performance',
    component: PerformanceStory,
} satisfies Meta<typeof PerformanceStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const MaterializedLight: Story = { args: { scheme: 'light' } };
export const MaterializedDark: Story = { args: { scheme: 'dark' } };
