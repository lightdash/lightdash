import { PersonSignInProvider } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import * as chartDataModel from '../../../components/DataViz/transformers/getChartDataModel';
import {
    WarehouseSignInPreflight,
    WarehouseSignInPreflightContext,
    activateWarehouseSignInPreflight,
    useWarehouseSignInExecution,
} from '../../../components/NavBar/warehouseSignInPreflight';
import { completeSharedSignInRestoration } from '../../../hooks/sharedSignInQueryRecovery';
import { SHARED_SIGN_IN_RECONNECTED } from '../../../hooks/useReconnectSharedSignIn';
import { getAsyncQueryError } from '../../queryRunner/asyncQueryError';
import { executeSqlQuery } from '../../queryRunner/executeQuery';
import { SqlRunnerSignInReadinessContext } from '../hooks/useSqlRunnerSignInReady';
import { store } from '../store';
import * as sqlRunnerSelectors from '../store/sqlRunnerSlice';
import {
    initialState,
    resetState,
    setState,
    setSql,
    setSqlLimit,
    setParameterValues,
} from '../store/sqlRunnerSlice';
import { prepareAndFetchChartData } from '../store/thunks';
import { ContentPanel } from './ContentPanel';

vi.mock('../../queryRunner/executeQuery', () => ({
    executeSqlQuery: vi.fn(),
    cancelAsyncQuery: vi.fn(),
}));
vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({
        health: { data: { query: { defaultLimit: 10 }, pivotTable: {} } },
    }),
}));
vi.mock('../../../hooks/organization/useOrganization', () => ({
    useOrganization: () => ({}),
}));
vi.mock('../../../hooks/useQueryCostEstimate', () => ({
    useQueryCostEstimateSettings: () => null,
    useSqlQueryCostEstimate: () => ({}),
    fetchSqlQueryCostEstimate: vi.fn(),
}));
vi.mock('../../parameters', () => ({
    Parameters: () => null,
    useParameters: () => ({}),
}));
vi.mock('../../../components/SqlRunner/RunSqlQueryButton', () => ({
    default: () => null,
}));
vi.mock('./SqlRunnerEditor', () => ({ SqlRunnerEditor: () => null }));
vi.mock('./SqlRunnerChart', () => ({ SqlRunnerChart: () => null }));
vi.mock('./SqlQueryHistory', () => ({ SqlQueryHistory: () => null }));
vi.mock('./Download/ChartDownload', () => ({ ChartDownload: () => null }));
vi.mock('./Download/ResultsDownloadButton', () => ({ default: () => null }));
vi.mock('../../../components/DataViz/visualizations/Table', () => ({
    Table: () => null,
}));
vi.mock('../../../components/DataViz/visualizations/ChartDataTable', () => ({
    ChartDataTable: () => null,
}));

const status = {
    personalSelection: { warehouseConnectionUuid: null },
    provider: PersonSignInProvider.GOOGLE,
    subject: null,
    subjectBasis: null,
    expired: false,
    canReconnect: false,
    personalSignIn: {
        projectUuid: 'project_a',
        provider: PersonSignInProvider.GOOGLE,
        userWarehouseCredentialsUuid: 'credential_a',
        expired: true,
        canReconnect: true,
    },
};
const ReadyContent = () => {
    const ready = useWarehouseSignInExecution('project_a', null, true, 1);
    return (
        <SqlRunnerSignInReadinessContext.Provider value={ready}>
            <ContentPanel />
        </SqlRunnerSignInReadinessContext.Provider>
    );
};
beforeEach(() => {
    vi.clearAllMocks();
    store.dispatch(resetState());
    store.dispatch(
        setState({
            ...initialState,
            projectUuid: 'project_a',
            sql: 'select 1',
            limit: 10,
            connectionRoute: { route: 'single' },
            fetchResultsOnLoad: true,
        }),
    );
});
it.each(['unchanged', 'sql', 'limit', 'parameters'] as const)(
    'retains a failed on-load SQL request across the modal gate with %s inputs',
    async (kind) => {
        const preflight = new WarehouseSignInPreflight(
            {
                projectUuid: 'project_a',
                userUuid: 'user_a',
                pageGeneration: 'page_a',
            },
            true,
            false,
        );
        const stop = activateWarehouseSignInPreflight(preflight);
        const client = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
        const error = getAsyncQueryError(
            'Your BigQuery sign-in has expired. Sign in with Google again to load this.',
        );
        vi.mocked(executeSqlQuery)
            .mockRejectedValueOnce(error)
            .mockResolvedValue({
                queryUuid: 'query_new',
                results: [],
                columns: [],
                durationMs: null,
                fileUrl: undefined,
            });
        const tree = (
            <MantineProvider env="test">
                <QueryClientProvider client={client}>
                    <Provider store={store}>
                        <MemoryRouter>
                            <WarehouseSignInPreflightContext.Provider
                                value={preflight}
                            >
                                <ReadyContent />
                            </WarehouseSignInPreflightContext.Provider>
                        </MemoryRouter>
                    </Provider>
                </QueryClientProvider>
            </MantineProvider>
        );
        const { unmount } = render(tree);
        expect(executeSqlQuery).not.toHaveBeenCalled();
        await act(() =>
            preflight.settle(
                null,
                preflight.checks.get('original')!.generation,
                status,
            ),
        );
        expect(executeSqlQuery).not.toHaveBeenCalled();
        act(() => {
            preflight.dismiss(preflight.target!);
        });
        await waitFor(() =>
            expect(store.getState().sqlRunner.queryError).toEqual(error.error),
        );
        await act(async () => {});
        if (kind === 'sql') {
            act(() => {
                store.dispatch(setSql('select 2'));
            });
            act(() => {
                store.dispatch(setSql('select 1'));
            });
        }
        if (kind === 'limit')
            act(() => {
                store.dispatch(setSqlLimit(20));
            });
        if (kind === 'parameters')
            act(() => {
                store.dispatch(setParameterValues({ value: 'changed' }));
            });
        act(() => {
            preflight.modalOpen = true;
            preflight.notify();
        });
        await act(async () => {
            const receipt = await completeSharedSignInRestoration(
                client,
                preflight.target!,
            );
            window.dispatchEvent(
                new CustomEvent(SHARED_SIGN_IN_RECONNECTED, {
                    detail: receipt,
                }),
            );
        });
        await waitFor(() =>
            expect(executeSqlQuery).toHaveBeenCalledTimes(
                kind === 'unchanged' ? 2 : 1,
            ),
        );
        await act(async () => {});
        expect(executeSqlQuery).toHaveBeenCalledTimes(
            kind === 'unchanged' ? 2 : 1,
        );
        unmount();
        stop();
        client.clear();
    },
);
it('runs an initially blocked on-load query once after accepted recovery', async () => {
    const preflight = new WarehouseSignInPreflight(
        {
            projectUuid: 'project_a',
            userUuid: 'user_a',
            pageGeneration: 'page_a',
        },
        true,
        false,
    );
    const stop = activateWarehouseSignInPreflight(preflight);
    const client = new QueryClient();
    vi.mocked(executeSqlQuery).mockResolvedValue({
        queryUuid: 'query_new',
        results: [],
        columns: [],
        durationMs: null,
        fileUrl: undefined,
    });
    const { unmount } = render(
        <MantineProvider env="test">
            <QueryClientProvider client={client}>
                <Provider store={store}>
                    <MemoryRouter>
                        <WarehouseSignInPreflightContext.Provider
                            value={preflight}
                        >
                            <ReadyContent />
                        </WarehouseSignInPreflightContext.Provider>
                    </MemoryRouter>
                </Provider>
            </QueryClientProvider>
        </MantineProvider>,
    );
    await act(async () =>
        preflight.settle(
            null,
            preflight.checks.get('original')!.generation,
            status,
        ),
    );
    expect(executeSqlQuery).not.toHaveBeenCalled();
    await act(async () => {
        const receipt = await completeSharedSignInRestoration(
            client,
            preflight.target!,
        );
        window.dispatchEvent(
            new CustomEvent(SHARED_SIGN_IN_RECONNECTED, { detail: receipt }),
        );
    });
    await waitFor(() => expect(executeSqlQuery).toHaveBeenCalledOnce());
    unmount();
    stop();
    client.clear();
});

it.each([false, true])(
    'replays a confirmed automatic pivot only while its inputs remain unchanged: changed=%s',
    async (changed) => {
        store.dispatch(
            setState({
                ...store.getState().sqlRunner,
                fetchResultsOnLoad: false,
            }),
        );
        const preflight = new WarehouseSignInPreflight(
            {
                projectUuid: 'project_a',
                userUuid: 'user_a',
                pageGeneration: 'page_a',
            },
            true,
            false,
        );
        const stop = activateWarehouseSignInPreflight(preflight);
        const client = new QueryClient();
        const pivot = vi
            .fn()
            .mockRejectedValueOnce(
                getAsyncQueryError(
                    'Your BigQuery sign-in has expired. Sign in with Google again to load this.',
                ),
            )
            .mockResolvedValue({});
        const runner = vi
            .spyOn(sqlRunnerSelectors, 'selectSqlRunnerResultsRunner')
            .mockReturnValue({
                invalidatePivotCache: vi.fn(),
                getRows: () => [],
                getColumnNames: () => [],
            } as never);
        const model = vi.spyOn(chartDataModel, 'default').mockReturnValue({
            getPivotedChartData: pivot,
            getSpec: vi.fn(),
            getPivotedTableData: vi.fn(),
            getDataDownloadUrl: vi.fn(),
        } as never);
        const { unmount } = render(
            <MantineProvider env="test">
                <QueryClientProvider client={client}>
                    <Provider store={store}>
                        <MemoryRouter>
                            <WarehouseSignInPreflightContext.Provider
                                value={preflight}
                            >
                                <ReadyContent />
                            </WarehouseSignInPreflightContext.Provider>
                        </MemoryRouter>
                    </Provider>
                </QueryClientProvider>
            </MantineProvider>,
        );
        try {
            act(() => {
                preflight.settle(
                    null,
                    preflight.checks.get('original')!.generation,
                    status,
                );
                preflight.dismiss(preflight.target!);
            });
            await act(async () => {
                await store.dispatch(prepareAndFetchChartData());
            });
            expect(pivot).toHaveBeenCalledOnce();
            if (changed)
                act(() => {
                    store.dispatch(setSqlLimit(20));
                });
            act(() => {
                preflight.modalOpen = true;
                preflight.notify();
            });
            await act(async () => {
                const receipt = await completeSharedSignInRestoration(
                    client,
                    preflight.target!,
                );
                window.dispatchEvent(
                    new CustomEvent(SHARED_SIGN_IN_RECONNECTED, {
                        detail: receipt,
                    }),
                );
            });
            await waitFor(() =>
                expect(pivot).toHaveBeenCalledTimes(changed ? 1 : 2),
            );
            expect(executeSqlQuery).not.toHaveBeenCalled();
        } finally {
            unmount();
            stop();
            client.clear();
            model.mockRestore();
            runner.mockRestore();
        }
    },
);
