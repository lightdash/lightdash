import { WarehouseTypes } from '@lightdash/common';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useContext } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { sharedLightdashApi } from '../api';
import { executeSqlQuery } from '../features/queryRunner/executeQuery';
import { useRunQueryOnLoad } from '../features/sqlRunner/hooks/useRunQueryOnLoad';
import { ActiveConnectionContext } from '../features/sqlRunner/multiConnection/hooks/activeConnectionContext';
import { store } from '../features/sqlRunner/store';
import {
    initialState,
    resetState,
} from '../features/sqlRunner/store/sqlRunnerSlice';
import { runSqlQuery } from '../features/sqlRunner/store/thunks';
import { renderWithProviders } from '../testing/testUtils';
import { EventName } from '../types/Events';
import SqlRunnerNewPage from './SqlRunner';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('../api');
vi.mock('../providers/Tracking/useTracking', () => ({
    default: () => ({ track }),
}));
vi.mock('../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-uuid',
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
    ContentPanel: () => {
        useRunQueryOnLoad({
            runQuery: async (sql: string) => {
                await store.dispatch(
                    runSqlQuery({
                        sql,
                        limit: 10,
                        projectUuid: 'project-uuid',
                        parameterValues: {},
                    }),
                );
            },
            hasQueryResults: false,
        });
        return null;
    },
}));
vi.mock('../features/sqlRunner', () => ({
    SqlRunnerSidebar: () => {
        const context = useContext(ActiveConnectionContext);
        if (!context) return <div data-testid="no-provider" />;
        return (
            <div data-testid="provider">
                {context.connections.map((connection) => (
                    <button
                        key={connection.warehouseConnectionUuid}
                        type="button"
                        onClick={() =>
                            context.switchConnection(
                                connection.warehouseConnectionUuid,
                            )
                        }
                    >
                        {connection.name}
                    </button>
                ))}
                <span data-testid="active">
                    {context.activeConnection?.name ?? 'none'}
                </span>
            </div>
        );
    },
}));

const mockApi = sharedLightdashApi as unknown as Mock;
const projectUuid = 'project-uuid';
const connectionsUrl = `/projects/${projectUuid}/sqlRunner/connections`;
const connections = [
    {
        warehouseConnectionUuid: 'original-uuid',
        name: 'Warehouse',
        isOriginal: true,
        warehouseType: WarehouseTypes.POSTGRES,
    },
    {
        warehouseConnectionUuid: 'finance-uuid',
        name: 'Finance',
        isOriginal: false,
        warehouseType: WarehouseTypes.POSTGRES,
    },
];

const shareParams = (warehouseConnectionUuid: string | null | undefined) =>
    JSON.stringify({
        sqlRunnerState: {
            ...initialState,
            projectUuid,
            sql: 'select 1',
            connectionRoute: undefined,
            fetchResultsOnLoad: undefined,
        },
        chartConfig: null,
        ...(warehouseConnectionUuid === undefined
            ? {}
            : { warehouseConnectionUuid }),
    });

type Gate = { resolve: (value: unknown) => void; promise: Promise<unknown> };
const gate = (): Gate => {
    let resolve: (value: unknown) => void = () => undefined;
    const promise = new Promise((r) => {
        resolve = r;
    });
    return { resolve, promise };
};

const mode = { current: 'multi' as 'multi' | 'single' };
const serve = ({
    shareGate,
    connectionsGate,
    projectGate,
}: {
    shareGate?: Gate;
    connectionsGate?: Gate;
    projectGate?: Gate;
}) =>
    mockApi.mockImplementation(async ({ url }: { url: string }) => {
        if (url === `/projects/${projectUuid}`) {
            if (projectGate) await projectGate.promise;
            return {
                projectUuid,
                organizationUuid: 'project-org-uuid',
                connectionRoute: mode.current,
                warehouseConnection: { type: WarehouseTypes.POSTGRES },
            };
        }
        if (url === connectionsUrl) {
            if (connectionsGate) await connectionsGate.promise;
            return connections;
        }
        if (url.startsWith('/share/')) {
            if (shareGate) return shareGate.promise;
            throw new Error('share not gated');
        }
        throw new Error(`Unexpected request ${url}`);
    });

const renderPage = (connectionHint?: string | null) => {
    renderWithProviders(
        <MemoryRouter
            initialEntries={[
                {
                    pathname: `/projects/${projectUuid}/sql-runner`,
                    search: '?share=share-id',
                    state:
                        connectionHint === undefined
                            ? undefined
                            : { warehouseConnectionUuid: connectionHint },
                },
            ]}
        >
            <SqlRunnerNewPage />
        </MemoryRouter>,
    );
    return userEvent.setup();
};

describe('review PR12b: real SqlRunner page with a shared link', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mode.current = 'multi';
        window.localStorage.clear();
        store.dispatch(resetState());
        window.localStorage.setItem(
            `lightdash.sqlRunner.lastConnection.${projectUuid}`,
            'original-uuid',
        );
    });

    it('COLD: share resolves before connections, unknown hint never runs', async () => {
        const shareGate = gate();
        const connectionsGate = gate();
        serve({ shareGate, connectionsGate });
        const user = renderPage();
        await act(async () => {
            shareGate.resolve({ params: shareParams('missing-uuid') });
        });
        await act(async () => {
            connectionsGate.resolve(undefined);
        });
        await screen.findByTestId('provider');
        await waitFor(() =>
            expect(store.getState().sqlRunner.sql).toBe('select 1'),
        );
        await waitFor(() =>
            expect(store.getState().sqlRunner.fetchResultsOnLoad).toBe(false),
        );
        await user.click(screen.getByRole('button', { name: 'Finance' }));
        await waitFor(() =>
            expect(screen.getByTestId('active')).toHaveTextContent('Finance'),
        );
        await new Promise((r) => {
            setTimeout(r, 100);
        });
        expect(executeSqlQuery).not.toHaveBeenCalled();
    });

    it('COLD: a valid hint waits for connections and runs on Finance', async () => {
        const shareGate = gate();
        const connectionsGate = gate();
        serve({ shareGate, connectionsGate });
        renderPage();
        await act(async () => {
            shareGate.resolve({ params: shareParams('finance-uuid') });
        });
        await waitFor(() =>
            expect(
                mockApi.mock.calls.some(
                    ([call]) =>
                        (call as { url: string }).url === connectionsUrl,
                ),
            ).toBe(true),
        );
        expect(store.getState().sqlRunner.sql).toBe('');
        await act(async () => {
            connectionsGate.resolve(undefined);
        });
        await waitFor(() =>
            expect(executeSqlQuery).toHaveBeenCalledWith(
                expect.anything(),
                projectUuid,
                'select 1',
                10,
                {},
                true,
                'finance-uuid',
                expect.objectContaining({ signal: expect.any(AbortSignal) }),
            ),
        );
        expect(screen.getByTestId('active')).toHaveTextContent('Finance');
    });

    it('COLD: share hint Finance beats navigation state original and runs once on Finance', async () => {
        const shareGate = gate();
        const connectionsGate = gate();
        serve({ shareGate, connectionsGate });
        renderPage('original-uuid');
        await act(async () => {
            shareGate.resolve({ params: shareParams('finance-uuid') });
        });
        await act(async () => {
            connectionsGate.resolve(undefined);
        });
        await waitFor(() =>
            expect(executeSqlQuery).toHaveBeenCalledWith(
                expect.anything(),
                projectUuid,
                'select 1',
                10,
                {},
                true,
                'finance-uuid',
                expect.objectContaining({ signal: expect.any(AbortSignal) }),
            ),
        );
        expect(screen.getByTestId('active')).toHaveTextContent('Finance');
        expect(vi.mocked(executeSqlQuery).mock.calls).toHaveLength(1);
    });

    it('SINGLE cold: a share auto-runs once and permits a manual run', async () => {
        mode.current = 'single';
        const shareGate = gate();
        const projectGate = gate();
        serve({ shareGate, projectGate });
        renderPage();
        await act(async () => {
            shareGate.resolve({ params: shareParams(undefined) });
        });
        await act(async () => {
            projectGate.resolve(undefined);
        });
        await waitFor(() =>
            expect(store.getState().sqlRunner.sql).toBe('select 1'),
        );
        await waitFor(() => expect(executeSqlQuery).toHaveBeenCalledTimes(1));
        expect(store.getState().sqlRunner.connectionRoute).toEqual({
            route: 'single',
        });
        await store.dispatch(
            runSqlQuery({
                sql: 'select 1',
                limit: 10,
                projectUuid,
                parameterValues: {},
            }),
        );
        expect(executeSqlQuery).toHaveBeenCalledTimes(2);
        expect(
            mockApi.mock.calls.map(([call]) => (call as { url: string }).url),
        ).not.toContain(connectionsUrl);
    });

    it('SINGLE warm: a share auto-runs once and permits a manual run', async () => {
        mode.current = 'single';
        const shareGate = gate();
        serve({ shareGate });
        renderPage();
        await waitFor(() =>
            expect(store.getState().sqlRunner.connectionRoute).toEqual({
                route: 'single',
            }),
        );
        await act(async () => {
            shareGate.resolve({ params: shareParams(undefined) });
        });
        await waitFor(() => expect(executeSqlQuery).toHaveBeenCalledTimes(1));
        expect(store.getState().sqlRunner.connectionRoute).toEqual({
            route: 'single',
        });
        await store.dispatch(
            runSqlQuery({
                sql: 'select 1',
                limit: 10,
                projectUuid,
                parameterValues: {},
            }),
        );
        expect(executeSqlQuery).toHaveBeenCalledTimes(2);
        expect(
            mockApi.mock.calls.map(([call]) => (call as { url: string }).url),
        ).not.toContain(connectionsUrl);
    });

    it('WARM: connections cached before the share resolves, unknown hint must still never run', async () => {
        const shareGate = gate();
        serve({ shareGate });
        const user = renderPage();
        await screen.findByTestId('provider');
        await act(async () => {
            shareGate.resolve({ params: shareParams('missing-uuid') });
        });
        await waitFor(() =>
            expect(store.getState().sqlRunner.sql).toBe('select 1'),
        );
        await new Promise((r) => {
            setTimeout(r, 50);
        });
        const fetchOnLoadAfterShare =
            store.getState().sqlRunner.fetchResultsOnLoad;
        expect(screen.getByTestId('active')).toHaveTextContent('none');
        await user.click(screen.getByRole('button', { name: 'Finance' }));
        await waitFor(() =>
            expect(screen.getByTestId('active')).toHaveTextContent('Finance'),
        );
        await new Promise((r) => {
            setTimeout(r, 100);
        });
        expect({
            fetchOnLoadAfterShare,
            executeCalls: vi.mocked(executeSqlQuery).mock.calls,
        }).toEqual({ fetchOnLoadAfterShare: false, executeCalls: [] });
    });

    it('WARM: a valid hint switches to Finance and runs there', async () => {
        const shareGate = gate();
        serve({ shareGate });
        renderPage();
        await screen.findByTestId('provider');
        await act(async () => {
            shareGate.resolve({ params: shareParams('finance-uuid') });
        });
        await waitFor(() =>
            expect(executeSqlQuery).toHaveBeenCalledWith(
                expect.anything(),
                projectUuid,
                'select 1',
                10,
                {},
                true,
                'finance-uuid',
                expect.objectContaining({ signal: expect.any(AbortSignal) }),
            ),
        );
        expect(screen.getByTestId('active')).toHaveTextContent('Finance');
    });

    it('runs a Finance share when the viewer picked Finance before it resolved', async () => {
        const shareGate = gate();
        serve({ shareGate });
        const user = renderPage();
        await screen.findByTestId('provider');
        await user.click(screen.getByRole('button', { name: 'Finance' }));
        expect(screen.getByTestId('active')).toHaveTextContent('Finance');
        await act(async () => {
            shareGate.resolve({ params: shareParams('finance-uuid') });
        });
        await waitFor(() =>
            expect(executeSqlQuery).toHaveBeenCalledWith(
                expect.anything(),
                projectUuid,
                'select 1',
                10,
                {},
                true,
                'finance-uuid',
                expect.objectContaining({ signal: expect.any(AbortSignal) }),
            ),
        );
        expect(screen.getByTestId('active')).toHaveTextContent('Finance');
        expect(store.getState().sqlRunner.connectionRoute).toMatchObject({
            route: 'multi',
            connection: { warehouseConnectionUuid: 'finance-uuid' },
        });
        expect(vi.mocked(executeSqlQuery).mock.calls).toHaveLength(1);
        expect(
            screen.queryByText(/was removed from this project/),
        ).not.toBeInTheDocument();
    });

    it('runs an original share when the viewer picked the original before it resolved', async () => {
        const shareGate = gate();
        serve({ shareGate });
        const user = renderPage();
        await screen.findByTestId('provider');
        await user.click(screen.getByRole('button', { name: 'Warehouse' }));
        expect(screen.getByTestId('active')).toHaveTextContent('Warehouse');
        await act(async () => {
            shareGate.resolve({ params: shareParams(null) });
        });
        await waitFor(() =>
            expect(executeSqlQuery).toHaveBeenCalledWith(
                expect.anything(),
                projectUuid,
                'select 1',
                10,
                {},
                true,
                null,
                expect.objectContaining({ signal: expect.any(AbortSignal) }),
            ),
        );
        expect(screen.getByTestId('active')).toHaveTextContent('Warehouse');
        expect(store.getState().sqlRunner.connectionRoute).toMatchObject({
            route: 'multi',
            connection: { warehouseConnectionUuid: null },
        });
        expect(vi.mocked(executeSqlQuery).mock.calls).toHaveLength(1);
    });

    it('does not rerun shared SQL after picking another connection', async () => {
        const shareGate = gate();
        serve({ shareGate });
        const user = renderPage();
        await screen.findByTestId('provider');
        await user.click(screen.getByRole('button', { name: 'Finance' }));
        await act(async () => {
            shareGate.resolve({ params: shareParams('finance-uuid') });
        });
        await waitFor(() =>
            expect(executeSqlQuery).toHaveBeenCalledWith(
                expect.anything(),
                projectUuid,
                'select 1',
                10,
                {},
                true,
                'finance-uuid',
                expect.objectContaining({ signal: expect.any(AbortSignal) }),
            ),
        );
        await user.click(screen.getByRole('button', { name: 'Warehouse' }));
        await waitFor(() =>
            expect(screen.getByTestId('active')).toHaveTextContent('Warehouse'),
        );
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
        });
        expect(vi.mocked(executeSqlQuery).mock.calls).toHaveLength(1);
    });

    it('uses the share hint when navigation state names another connection', async () => {
        const shareGate = gate();
        serve({ shareGate });
        renderPage('original-uuid');
        await screen.findByTestId('provider');
        await act(async () => {
            shareGate.resolve({ params: shareParams('finance-uuid') });
        });
        await waitFor(() =>
            expect(executeSqlQuery).toHaveBeenCalledWith(
                expect.anything(),
                projectUuid,
                'select 1',
                10,
                {},
                true,
                'finance-uuid',
                expect.objectContaining({ signal: expect.any(AbortSignal) }),
            ),
        );
        expect(screen.getByTestId('active')).toHaveTextContent('Finance');
    });

    it('WARM: a legacy link with no hint never runs, even after a manual pick', async () => {
        const shareGate = gate();
        serve({ shareGate });
        const user = renderPage();
        await screen.findByTestId('provider');
        await act(async () => {
            shareGate.resolve({ params: shareParams(undefined) });
        });
        await waitFor(() =>
            expect(store.getState().sqlRunner.sql).toBe('select 1'),
        );
        await new Promise((r) => {
            setTimeout(r, 50);
        });
        await user.click(screen.getByRole('button', { name: 'Finance' }));
        await waitFor(() =>
            expect(screen.getByTestId('active')).toHaveTextContent('Finance'),
        );
        await new Promise((r) => {
            setTimeout(r, 100);
        });
        expect(vi.mocked(executeSqlQuery).mock.calls).toEqual([]);
    });
});

describe('share link analytics', () => {
    const shareOpenedCalls = () =>
        track.mock.calls.filter(
            ([event]) => event.name === EventName.SQL_RUNNER_SHARE_LINK_OPENED,
        );

    beforeEach(() => {
        vi.clearAllMocks();
        mode.current = 'multi';
        window.localStorage.clear();
        store.dispatch(resetState());
    });

    it.each([
        [
            'finance-uuid',
            {
                carriesConnection: true,
                outcome: 'applied',
                failureReason: null,
                warehouseConnectionId: 'finance-uuid',
                connectionKind: 'extra',
            },
        ],
        [
            'missing-uuid',
            {
                carriesConnection: true,
                outcome: 'connection_unresolved',
                failureReason: 'connection_not_found',
                warehouseConnectionId: 'missing-uuid',
                connectionKind: 'extra',
            },
        ],
        [
            undefined,
            {
                carriesConnection: false,
                outcome: 'connection_unresolved',
                failureReason: 'connection_not_carried',
                warehouseConnectionId: null,
                connectionKind: null,
            },
        ],
    ] as const)(
        'tracks a multi-connection share carrying %s once',
        async (binding, expected) => {
            const shareGate = gate();
            serve({ shareGate });
            renderPage();
            await act(async () => {
                shareGate.resolve({ params: shareParams(binding) });
            });
            await waitFor(() =>
                expect(store.getState().sqlRunner.sql).toBe('select 1'),
            );

            expect(shareOpenedCalls()).toHaveLength(1);
            expect(shareOpenedCalls()[0][0].properties).toMatchObject({
                organizationId: 'project-org-uuid',
                projectId: projectUuid,
                connectionCount: 2,
                connectionRoute: 'multi',
                ...expected,
            });
            expect(JSON.stringify(track.mock.calls)).not.toMatch(
                /select 1|Finance|Warehouse/,
            );
        },
    );

    it('tracks a share that fails to load once', async () => {
        mockApi.mockImplementation(async ({ url }: { url: string }) => {
            if (url === `/projects/${projectUuid}`) {
                return {
                    projectUuid,
                    connectionRoute: mode.current,
                    warehouseConnection: { type: WarehouseTypes.POSTGRES },
                };
            }
            if (url === connectionsUrl) return connections;
            if (url.startsWith('/share/')) {
                throw { error: { name: 'NotFoundError', message: 'gone' } };
            }
            throw new Error(`Unexpected request ${url}`);
        });
        renderPage();

        await waitFor(() => expect(shareOpenedCalls()).toHaveLength(1));
        expect(shareOpenedCalls()[0][0].properties).toMatchObject({
            projectId: projectUuid,
            connectionCount: null,
            connectionRoute: null,
            outcome: 'load_failed',
            failureReason: 'share_fetch_failed',
            warehouseConnectionId: null,
        });
    });
});
