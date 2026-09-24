import { WarehouseTypes } from '@lightdash/common';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useContext } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { lightdashApi } from '../api';
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
import SqlRunnerNewPage from './SqlRunner';

vi.mock('../api', () => ({ lightdashApi: vi.fn() }));
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

const mockApi = lightdashApi as unknown as Mock;
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

const serve = ({
    shareGate,
    connectionsGate,
}: {
    shareGate?: Gate;
    connectionsGate?: Gate;
}) =>
    mockApi.mockImplementation(async ({ url }: { url: string }) => {
        if (url === `/projects/${projectUuid}`) {
            return {
                projectUuid,
                connectionRoute: 'multi',
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

const renderPage = () => {
    renderWithProviders(
        <MemoryRouter
            initialEntries={[
                `/projects/${projectUuid}/sql-runner?share=share-id`,
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
                projectUuid,
                'select 1',
                10,
                {},
                true,
                'finance-uuid',
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
