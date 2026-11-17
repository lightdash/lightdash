import {
    FeatureFlags,
    type ModelMaterializationStatus,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { type LightdashApiProps } from '../../api';
import { MaterializedBadge } from './ModelSourceCard';
import { ModelTabs } from './ModelTabs';
import {
    ModelMaterializationContext,
    useModelMaterializationOverview,
} from './useModelMaterialization';
import { useApplySemanticLayerDraft } from './useSemanticLayerModel';

const api = vi.hoisted(() => vi.fn());
vi.mock('../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => api,
}));
vi.mock('./ModelPreAggregates', () => ({
    ModelPreAggregates: () => <p>Existing pre-aggregate</p>,
}));

const live: ModelMaterializationStatus = {
    state: 'live',
    servingCopy: false,
    asOf: null,
    rowCount: null,
    maxRows: null,
    byteCount: null,
    nextRefresh: null,
    failureReason: null,
};
const ready: ModelMaterializationStatus = {
    state: 'materialized',
    servingCopy: true,
    asOf: '2026-11-17T10:00:00Z',
    rowCount: 3,
    maxRows: 1000,
    byteCount: 1200,
    nextRefresh: null,
    failureReason: null,
};
const base = '/projects/project/semantic-studio';
const modelUrl = `${base}/models/items`;
const source = `${modelUrl}/materialization`;

function setup(
    status: ModelMaterializationStatus,
    { enabled = true, dbt = false, repo = false, drafted = false } = {},
) {
    let current = status;
    api.mockReset();
    api.mockImplementation(async ({ url, method }: LightdashApiProps) => {
        if (url === `/feature-flag/${FeatureFlags.SemanticStudioEditing}`)
            return { enabled };
        if (url === `${base}/status`)
            return {
                enabled: true,
                appliesAs: dbt
                    ? 'dbt_pull_request'
                    : repo
                      ? 'pull_request'
                      : 'live',
            };
        if (url === '/health?skipMigrationCheck=true')
            return { preAggregates: { enabled: true } };
        if (url === modelUrl) return { name: 'items', history: [], version: 1 };
        if (url === `${base}/materializations`)
            return { models: current.servingCopy ? ['items'] : [] };
        if (url === `${base}/draft`)
            return {
                models: drafted
                    ? [
                          {
                              model: 'items',
                              contentAfter: '{"materialize":{"max_rows":1000}}',
                          },
                      ]
                    : [],
            };
        if (method === 'POST' && url === `${base}/draft/apply`) {
            current = { ...current, state: 'preparing' };
            return {};
        }
        if (url === source) return current;
        if (url === `${source}/sample`)
            return { columns: ['amount'], rows: [{ amount: '17.50' }] };
        if (
            method === 'POST' &&
            (url === `${source}/draft` || url === `${source}/refresh`)
        )
            return {};
        throw new Error('Unexpected request');
    });
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    if (!enabled) {
        queryClient.setQueryData(['semantic-layer-status', 'project'], {
            enabled: true,
            appliesAs: 'live',
        });
        queryClient.setQueryData(
            ['studio-materializations', 'project', 'list'],
            { models: ['items'] },
        );
    }
    const Page = () => {
        const overview = useModelMaterializationOverview('project');
        const [params, setParams] = useSearchParams();
        const apply = useApplySemanticLayerDraft('project');
        return (
            <ModelMaterializationContext.Provider value={overview}>
                <MaterializedBadge model="items" />
                {params.get('draft') === 'review' ? (
                    <>
                        <p>Draft review</p>
                        <button
                            type="button"
                            onClick={() =>
                                apply.mutate(null, {
                                    onSuccess: () =>
                                        setParams({ view: 'performance' }),
                                })
                            }
                        >
                            Publish draft
                        </button>
                    </>
                ) : (
                    <ModelTabs
                        projectUuid="project"
                        modelName="items"
                        exploreName="items"
                        fields="Fields"
                    />
                )}
            </ModelMaterializationContext.Provider>
        );
    };
    render(
        <MantineProvider env="test">
            <QueryClientProvider client={queryClient}>
                <MemoryRouter initialEntries={['/?view=pre-aggregates']}>
                    <Page />
                </MemoryRouter>
            </QueryClientProvider>
        </MantineProvider>,
    );
    return (next: ModelMaterializationStatus) => {
        current = next;
    };
}

describe('Model performance in Studio', () => {
    it('opens the old tab URL, shows existing pre-aggregates and adds a normal draft', async () => {
        setup(live);
        expect(
            await screen.findByRole('tab', { name: 'Performance' }),
        ).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('Existing pre-aggregate')).toBeInTheDocument();
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Materialize this model',
            }),
        );
        expect(await screen.findByText('Draft review')).toBeInTheDocument();
        expect(api).toHaveBeenCalledWith({
            url: `${source}/draft`,
            method: 'POST',
            body: undefined,
        });
        expect(api).not.toHaveBeenCalledWith(
            expect.objectContaining({ url: `${source}/sample` }),
        );
    });
    it('publishes a draft and polls until the first copy and its badge are ready', async () => {
        const update = setup(live);
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Materialize this model',
            }),
        );
        fireEvent.click(
            await screen.findByRole('button', { name: 'Publish draft' }),
        );
        expect(
            await screen.findByText('Preparing · serving live'),
        ).toBeInTheDocument();
        expect(screen.queryByText('Materialized')).not.toBeInTheDocument();
        update(ready);
        expect(
            await screen.findByRole(
                'table',
                { name: 'Sample from the materialized copy' },
                { timeout: 5000 },
            ),
        ).toBeInTheDocument();
        expect(await screen.findByText('Materialized')).toBeInTheDocument();
    });
    it('explains that a repository draft builds after merge and deploy', async () => {
        setup(live, { repo: true, drafted: true });
        expect(
            await screen.findByRole('button', { name: 'Review draft' }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/after the pull request is merged and deployed/),
        ).toBeInTheDocument();
    });
    it('shows the active copy and reads its sample, then queues refresh', async () => {
        const update = setup(ready);
        expect(
            await screen.findByText(
                'Materialized · as of 17 Nov 2026, 10:00 UTC',
            ),
        ).toBeInTheDocument();
        expect(screen.getByText('Materialized')).toBeInTheDocument();
        expect(
            await screen.findByRole('cell', { name: '17.50' }),
        ).toBeInTheDocument();
        expect(screen.getByText('3 of 1,000')).toBeInTheDocument();
        expect(screen.getByText('Not scheduled')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Refresh now' }));
        expect(
            await screen.findByText('Refresh requested'),
        ).toBeInTheDocument();
        update({ ...ready, state: 'preparing' });
        expect(
            await screen.findByText(
                'Refreshing the copy',
                {},
                { timeout: 5000 },
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Refresh now' }),
        ).toBeDisabled();
        await waitFor(() =>
            expect(api).toHaveBeenCalledWith({
                url: `${source}/refresh`,
                method: 'POST',
                body: undefined,
            }),
        );
    });
    it('shows a preparing copy without requesting a sample', async () => {
        setup({ ...live, state: 'preparing' });
        expect(
            await screen.findByText('Preparing · serving live'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Refresh now' }),
        ).toBeDisabled();
        expect(api).not.toHaveBeenCalledWith(
            expect.objectContaining({ url: `${source}/sample` }),
        );
    });
    it('shows the failure reason', async () => {
        setup({
            ...live,
            state: 'blocked',
            failureReason: 'Row limit exceeded',
        });
        expect(
            await screen.findByText('Row limit exceeded'),
        ).toBeInTheDocument();
    });
    it.each([{ enabled: false }, { dbt: true }])(
        'keeps the old tab and skips all copy reads with %o',
        async (options) => {
            setup(live, options);
            expect(
                await screen.findByRole('tab', { name: 'Pre-aggregates' }),
            ).toBeInTheDocument();
            expect(
                screen.queryByRole('tab', { name: 'Performance' }),
            ).not.toBeInTheDocument();
            expect(api).not.toHaveBeenCalledWith(
                expect.objectContaining({ url: source }),
            );
            expect(api).not.toHaveBeenCalledWith(
                expect.objectContaining({ url: `${base}/materializations` }),
            );
        },
    );
});
