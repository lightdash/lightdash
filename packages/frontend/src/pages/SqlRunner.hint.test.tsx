import { WarehouseTypes } from '@lightdash/common';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useContext } from 'react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { lightdashApi } from '../api';
import { executeSqlQuery } from '../features/queryRunner/executeQuery';
import { ConnectionPicker } from '../features/sqlRunner/multiConnection/components/ConnectionPicker';
import { ActiveConnectionContext } from '../features/sqlRunner/multiConnection/hooks/activeConnectionContext';
import { sqlRunnerConnectionsQueryKey } from '../features/sqlRunner/multiConnection/hooks/useConnectionCatalog';
import { store } from '../features/sqlRunner/store';
import { resetState } from '../features/sqlRunner/store/sqlRunnerSlice';
import { runSqlQuery } from '../features/sqlRunner/store/thunks';
import { createQueryClient } from '../providers/ReactQuery/createQueryClient';
import { renderWithProviders } from '../testing/testUtils';
import SqlRunnerNewPage from './SqlRunner';

const { runs, toaster } = vi.hoisted(() => ({
    runs: [] as { rejected: boolean; message: string | undefined }[],
    toaster: {
        showToastInfo: vi.fn(),
        showToastError: vi.fn(),
        showToastSuccess: vi.fn(),
        showToastApiError: vi.fn(),
    },
}));

vi.mock('../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-uuid',
}));
vi.mock('../hooks/toaster/useToaster', () => ({
    default: () => toaster,
}));
vi.mock('../features/queryRunner/executeQuery', () => ({
    executeSqlQuery: vi.fn(async () => ({
        queryUuid: 'query-uuid',
        fileUrl: '/results',
        results: [],
        columns: [],
    })),
}));
vi.mock('../components/common/Page/Page', () => ({
    default: ({
        sidebar,
        children,
    }: {
        sidebar: React.ReactNode;
        children: React.ReactNode;
    }) => (
        <div>
            {sidebar}
            {children}
        </div>
    ),
}));
vi.mock('../features/sqlRunner/components/Header', () => ({
    Header: () => null,
}));
vi.mock('../features/virtualView', () => ({
    HeaderVirtualView: () => null,
}));
vi.mock('../features/sqlRunner/components/ContentPanel', () => ({
    ContentPanel: () => (
        <button
            type="button"
            onClick={() => {
                void store
                    .dispatch(
                        runSqlQuery({
                            sql: store.getState().sqlRunner.sql,
                            limit: 10,
                            projectUuid: 'project-uuid',
                            parameterValues: {},
                        }),
                    )
                    .then((action) => {
                        runs.push({
                            rejected: runSqlQuery.rejected.match(action),
                            message: runSqlQuery.rejected.match(action)
                                ? action.payload?.message
                                : undefined,
                        });
                    });
            }}
        >
            Run query
        </button>
    ),
}));
vi.mock('../features/sqlRunner', () => ({
    SqlRunnerSidebar: () => {
        const context = useContext(ActiveConnectionContext);
        if (!context) return <div data-testid="no-provider" />;
        return (
            <div data-testid="provider">
                <ConnectionPicker />
                <span data-testid="active">
                    {context.activeConnection?.name ?? 'none'}
                </span>
                <span data-testid="settled">
                    {String(context.isConnectionSettled)}
                </span>
            </div>
        );
    },
}));

const mockApi = lightdashApi as unknown as Mock;
const projectUuid = 'project-uuid';
const runnerPath = `/projects/${projectUuid}/sql-runner`;
const connectionsUrl = `/projects/${projectUuid}/sqlRunner/connections`;
const original = {
    warehouseConnectionUuid: 'original-uuid',
    name: 'Warehouse',
    isOriginal: true,
    warehouseType: WarehouseTypes.POSTGRES,
};
const finance = {
    warehouseConnectionUuid: 'finance-uuid',
    name: 'Finance',
    isOriginal: false,
    warehouseType: WarehouseTypes.POSTGRES,
};
const connections = [original, finance];
const projectResponse = (connectionRoute: 'single' | 'multi') => ({
    projectUuid,
    connectionRoute,
    warehouseConnection: { type: WarehouseTypes.POSTGRES },
});

type Gate = { resolve: () => void; promise: Promise<void> };
const gate = (): Gate => {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((r) => {
        resolve = r;
    });
    return { resolve, promise };
};

const serve = ({
    connectionRoute = 'multi',
    connectionsGate,
    served = connections,
}: {
    connectionRoute?: 'single' | 'multi';
    connectionsGate?: Gate;
    served?: typeof connections;
}) =>
    mockApi.mockImplementation(async ({ url }: { url: string }) => {
        if (url === `/projects/${projectUuid}`)
            return projectResponse(connectionRoute);
        if (url === connectionsUrl) {
            if (connectionsGate) await connectionsGate.promise;
            return served;
        }
        throw new Error(`Unexpected request ${url}`);
    });

const requestedUrls = (): string[] =>
    mockApi.mock.calls.map((call) => (call[0] as { url: string }).url);

const coldClient = () => createQueryClient({ queries: { retry: false } });
const warmClient = (
    cached: typeof connections = connections,
    updatedAt = Date.now(),
) => {
    const client = coldClient();
    client.setQueryData(['project', projectUuid], projectResponse('multi'));
    client.setQueryData(sqlRunnerConnectionsQueryKey(projectUuid), cached, {
        updatedAt,
    });
    return client;
};

const LocationState = () => {
    const location = useLocation();
    return (
        <output data-testid="navigation-state">
            {JSON.stringify(location.state)}
        </output>
    );
};

const renderPage = ({
    client,
    state,
}: {
    client: QueryClient;
    state: Record<string, unknown> | undefined;
}) => {
    renderWithProviders(
        <QueryClientProvider client={client}>
            <MemoryRouter initialEntries={[{ pathname: runnerPath, state }]}>
                <Routes>
                    <Route
                        path="/projects/:projectUuid/sql-runner"
                        element={
                            <>
                                <SqlRunnerNewPage />
                                <LocationState />
                                <Link to="/elsewhere">away</Link>
                            </>
                        }
                    />
                    <Route
                        path="/elsewhere"
                        element={<Link to={runnerPath}>back</Link>}
                    />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    );
    return userEvent.setup();
};

const lastExecuteConnection = () =>
    vi.mocked(executeSqlQuery).mock.calls.at(-1)?.[5];

const runOnce = async (user: ReturnType<typeof userEvent.setup>) => {
    const before = runs.length;
    await user.click(screen.getByRole('button', { name: 'Run query' }));
    await waitFor(() => expect(runs.length).toBe(before + 1));
    return runs[before];
};

describe('review PR12c: real SqlRunner page opened from the explorer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        runs.length = 0;
        window.localStorage.clear();
        store.dispatch(resetState());
        window.localStorage.setItem(
            `lightdash.sqlRunner.lastConnection.${projectUuid}`,
            'original-uuid',
        );
    });

    it('WARM: connections cached before mount, Finance hint, last-used original: opens and runs on Finance', async () => {
        serve({});
        const user = renderPage({
            client: warmClient(),
            state: { sql: 'select 1', warehouseConnectionUuid: 'finance-uuid' },
        });
        await waitFor(() =>
            expect(screen.getByTestId('active')).toHaveTextContent('Finance'),
        );
        await waitFor(() =>
            expect(screen.getByTestId('navigation-state')).toHaveTextContent(
                'null',
            ),
        );
        expect(store.getState().sqlRunner.sql).toBe('select 1');
        expect(store.getState().sqlRunner.connectionRoute).toEqual({
            route: 'multi',
            connection: {
                warehouseConnectionUuid: 'finance-uuid',
                name: 'Finance',
                warehouseType: WarehouseTypes.POSTGRES,
            },
        });
        const run = await runOnce(user);
        expect(run).toEqual({ rejected: false, message: undefined });
        expect(lastExecuteConnection()).toBe('finance-uuid');
        expect(
            window.localStorage.getItem(
                `lightdash.sqlRunner.lastConnection.${projectUuid}`,
            ),
        ).toBe('original-uuid');
        expect(toaster.showToastInfo).not.toHaveBeenCalled();
        expect(requestedUrls()).not.toContain(connectionsUrl);
    });

    it('COLD: connections arrive after the state is cleared: opens and runs on Finance', async () => {
        const connectionsGate = gate();
        serve({ connectionsGate });
        const user = renderPage({
            client: coldClient(),
            state: { sql: 'select 1', warehouseConnectionUuid: 'finance-uuid' },
        });
        await waitFor(() =>
            expect(screen.getByTestId('navigation-state')).toHaveTextContent(
                'null',
            ),
        );
        await waitFor(() => expect(requestedUrls()).toContain(connectionsUrl));
        expect(screen.getByTestId('no-provider')).toBeInTheDocument();
        await act(async () => {
            connectionsGate.resolve();
        });
        await waitFor(() =>
            expect(screen.getByTestId('active')).toHaveTextContent('Finance'),
        );
        const run = await runOnce(user);
        expect(run.rejected).toBe(false);
        expect(lastExecuteConnection()).toBe('finance-uuid');
    });

    it.each([['warm', true] as const, ['cold', false] as const])(
        '%s: an unknown hint shows the picker empty, never runs, and raises no removed toast',
        async (_label, warm) => {
            serve({});
            const user = renderPage({
                client: warm ? warmClient() : coldClient(),
                state: {
                    sql: 'select 1',
                    warehouseConnectionUuid: 'other-project-uuid',
                },
            });
            await screen.findByTestId('provider');
            expect(screen.getByTestId('active')).toHaveTextContent('none');
            expect(screen.getByTestId('settled')).toHaveTextContent('false');
            expect(
                screen.getByPlaceholderText('Choose a connection'),
            ).toBeInTheDocument();
            expect(store.getState().sqlRunner.connectionRoute).toEqual({
                route: 'multi',
                connection: null,
            });
            const run = await runOnce(user);
            expect(run).toEqual({
                rejected: true,
                message: 'Choose a connection before you run this query.',
            });
            expect(executeSqlQuery).not.toHaveBeenCalled();
            expect(toaster.showToastInfo).not.toHaveBeenCalled();
        },
    );

    it('a NULL-bound explore opens on the original despite last-used Finance', async () => {
        window.localStorage.setItem(
            `lightdash.sqlRunner.lastConnection.${projectUuid}`,
            'finance-uuid',
        );
        serve({});
        const user = renderPage({
            client: coldClient(),
            state: { sql: 'select 1', warehouseConnectionUuid: null },
        });
        await waitFor(() =>
            expect(screen.getByTestId('active')).toHaveTextContent('Warehouse'),
        );
        const run = await runOnce(user);
        expect(run.rejected).toBe(false);
        expect(lastExecuteConnection()).toBeNull();
    });

    it('single project: no connections request, single route, run has no connection field', async () => {
        serve({ connectionRoute: 'single' });
        const user = renderPage({
            client: coldClient(),
            state: { sql: 'select 1' },
        });
        await waitFor(() =>
            expect(store.getState().sqlRunner.connectionRoute).toEqual({
                route: 'single',
            }),
        );
        await waitFor(() =>
            expect(screen.getByTestId('navigation-state')).toHaveTextContent(
                'null',
            ),
        );
        expect(screen.getByTestId('no-provider')).toBeInTheDocument();
        const run = await runOnce(user);
        expect(run.rejected).toBe(false);
        expect(lastExecuteConnection()).toBeUndefined();
        expect(requestedUrls()).toEqual([`/projects/${projectUuid}`]);
    });

    it('the hint does not survive leaving and coming back to the runner', async () => {
        serve({});
        const user = renderPage({
            client: warmClient(),
            state: { sql: 'select 1', warehouseConnectionUuid: 'finance-uuid' },
        });
        await waitFor(() =>
            expect(screen.getByTestId('active')).toHaveTextContent('Finance'),
        );
        await user.click(screen.getByRole('link', { name: 'away' }));
        await screen.findByRole('link', { name: 'back' });
        expect(store.getState().sqlRunner.connectionRoute).toEqual({
            route: 'pending',
        });
        await user.click(screen.getByRole('link', { name: 'back' }));
        await waitFor(() =>
            expect(screen.getByTestId('active')).toHaveTextContent('Warehouse'),
        );
        expect(screen.getByTestId('navigation-state')).toHaveTextContent(
            'null',
        );
    });

    it('EDGE: selects Finance when a stale cached list refreshes to include the hint', async () => {
        serve({});
        renderPage({
            client: warmClient([original], Date.now() - 60_000),
            state: { sql: 'select 1', warehouseConnectionUuid: 'finance-uuid' },
        });
        await screen.findByTestId('provider');
        await waitFor(() => expect(requestedUrls()).toContain(connectionsUrl));
        await screen.findByRole('combobox', { name: 'Active connection' });
        await waitFor(() =>
            expect(screen.getByTestId('active')).toHaveTextContent('Finance'),
        );
        expect({
            active: screen.getByTestId('active').textContent,
            settled: screen.getByTestId('settled').textContent,
            connection: store.getState().sqlRunner.connectionRoute,
        }).toEqual({
            active: 'Finance',
            settled: 'true',
            connection: {
                route: 'multi',
                connection: {
                    warehouseConnectionUuid: 'finance-uuid',
                    name: 'Finance',
                    warehouseType: WarehouseTypes.POSTGRES,
                },
            },
        });
    });
});
