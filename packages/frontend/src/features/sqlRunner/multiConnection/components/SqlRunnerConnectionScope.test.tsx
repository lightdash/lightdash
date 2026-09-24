import {
    WarehouseTableType,
    WarehouseTypes,
    type SqlChart,
    type SqlRunnerWarehouseConnection,
} from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type Mock,
} from 'vitest';
import { lightdashApi } from '../../../../api';
import { renderWithProviders } from '../../../../testing/testUtils';
import { SqlEditor, SqlEditorView } from '../../components/SqlEditor';
import { SqlRunnerEditor } from '../../components/SqlRunnerEditor';
import { useRunQueryOnLoad } from '../../hooks/useRunQueryOnLoad';
import { store } from '../../store';
import {
    resetState,
    selectConnectionRequest,
    setFetchResultsOnLoad,
    setProjectUuid,
    setSavedChartData,
    setSql,
} from '../../store/sqlRunnerSlice';
import { SqlRunnerConnectionScope } from './SqlRunnerConnectionScope';
import { SqlRunnerSidebar } from './SqlRunnerSidebar';

vi.mock('../../../../api', () => ({
    lightdashApi: vi.fn(),
}));

vi.mock('../../components/Sidebar', () => ({
    Sidebar: vi.fn(() => <div data-testid="main-sidebar" />),
}));

vi.mock('../../components/SqlEditor', () => ({
    SqlEditor: vi.fn(() => <div data-testid="main-sql-editor" />),
    SqlEditorView: vi.fn(() => <div data-testid="sql-editor-view" />),
}));

vi.mock('@tanstack/react-virtual', () => ({
    useVirtualizer: ({
        count,
        getItemKey,
    }: {
        count: number;
        getItemKey: (index: number) => string | number;
    }) => ({
        getTotalSize: () => count * 30,
        getVirtualItems: () =>
            Array.from({ length: count }, (_, index) => ({
                index,
                key: getItemKey(index),
                start: index * 30,
                size: 30,
            })),
        measureElement: () => undefined,
    }),
}));

vi.mock('../../../../components/DataViz/VisualizationConfigPanel', () => ({
    VisualizationConfigPanel: () => null,
}));

const mockApi = lightdashApi as unknown as Mock;
const projectUuid = 'project-uuid';
const connectionsUrl = `/projects/${projectUuid}/sqlRunner/connections`;
const financeFieldsUrl = `${connectionsUrl}/finance-uuid/fields?databaseName=finance&schemaName=public&tableName=ledger`;

const connections: SqlRunnerWarehouseConnection[] = [
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
        warehouseType: WarehouseTypes.BIGQUERY,
    },
];

const serveApi = (connectionRoute: 'single' | 'multi') =>
    mockApi.mockImplementation(async ({ url }: { url: string }) => {
        if (url === `/projects/${projectUuid}`) {
            return { projectUuid, connectionRoute };
        }
        if (url === connectionsUrl) return connections;
        if (url.endsWith('/databases')) {
            const database = url.includes('finance') ? 'finance' : 'warehouse';
            return {
                databases: [
                    { name: database, database, schema: null, isDefault: true },
                ],
                truncated: false,
                limit: 100,
            };
        }
        if (url === `${connectionsUrl}/finance-uuid/tables?database=finance`) {
            return {
                finance: {
                    public: {
                        ledger: { tableType: WarehouseTableType.TABLE },
                    },
                },
            };
        }
        if (url === financeFieldsUrl) return { amount: 'number' };
        throw new Error(`Unexpected request ${url}`);
    });

const renderScope = (
    children: React.ReactNode,
    isEditingSavedChart = false,
    connectionHint?: string | null,
) => {
    renderWithProviders(
        <Provider store={store}>
            <SqlRunnerConnectionScope
                isEditingSavedChart={isEditingSavedChart}
                connectionHint={connectionHint}
            >
                {children}
            </SqlRunnerConnectionScope>
        </Provider>,
    );
    return userEvent.setup();
};

const connectionRoute = () => store.getState().sqlRunner.connectionRoute;
const requestedUrls = (): string[] =>
    mockApi.mock.calls.map((call) => (call[0] as { url: string }).url);

const pickFinance = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(
        await screen.findByRole('combobox', { name: 'Active connection' }),
    );
    await user.click(await screen.findByRole('option', { name: 'Finance' }));
};

const AutoRun = ({
    runQuery,
}: {
    runQuery: (sql: string) => Promise<void>;
}) => {
    useRunQueryOnLoad({ runQuery, hasQueryResults: false });
    return null;
};

describe('SqlRunnerConnectionScope', () => {
    beforeEach(() => {
        window.localStorage.clear();
        store.dispatch(resetState());
        store.dispatch(setProjectUuid(projectUuid));
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('makes the whole page single for a single project and loads no connection', async () => {
        serveApi('single');
        renderScope(<SqlRunnerSidebar />);

        await waitFor(() =>
            expect(connectionRoute()).toEqual({ route: 'single' }),
        );
        expect(requestedUrls()).not.toContain(connectionsUrl);
    });

    it('publishes the connection picked in the sidebar to the page', async () => {
        serveApi('multi');
        const user = renderScope(<SqlRunnerSidebar />);

        await waitFor(() =>
            expect(connectionRoute()).toEqual({
                route: 'multi',
                connection: null,
            }),
        );
        await pickFinance(user);

        await waitFor(() =>
            expect(connectionRoute()).toEqual({
                route: 'multi',
                connection: {
                    warehouseConnectionUuid: 'finance-uuid',
                    name: 'Finance',
                    warehouseType: WarehouseTypes.BIGQUERY,
                },
            }),
        );
        expect(store.getState().sqlRunner.warehouseConnectionType).toBe(
            WarehouseTypes.BIGQUERY,
        );
    });

    it('publishes the original as null', async () => {
        serveApi('multi');
        window.localStorage.setItem(
            `lightdash.sqlRunner.lastConnection.${projectUuid}`,
            'original-uuid',
        );
        renderScope(<SqlRunnerSidebar />);

        await waitFor(() =>
            expect(connectionRoute()).toMatchObject({
                route: 'multi',
                connection: { warehouseConnectionUuid: null },
            }),
        );
    });

    it('opens an explore hint on Finance before running, despite a last-used original', async () => {
        serveApi('multi');
        window.localStorage.setItem(
            `lightdash.sqlRunner.lastConnection.${projectUuid}`,
            'original-uuid',
        );
        store.dispatch(setSql('select * from finance.public.ledger'));
        store.dispatch(
            setFetchResultsOnLoad({
                shouldFetch: true,
                shouldOpenChartOnLoad: false,
            }),
        );
        const requests: ReturnType<typeof selectConnectionRequest>[] = [];
        const runQuery = vi.fn(async () => {
            requests.push(selectConnectionRequest(store.getState()));
        });

        renderScope(<AutoRun runQuery={runQuery} />, false, 'finance-uuid');

        await waitFor(() => expect(runQuery).toHaveBeenCalledOnce());
        expect(requests).toEqual([
            {
                ready: true,
                field: { warehouseConnectionUuid: 'finance-uuid' },
            },
        ]);
        expect(runQuery).toHaveBeenCalledWith(
            'select * from finance.public.ledger',
        );
    });

    it('opens an original-bound explore on the original despite last-used Finance', async () => {
        serveApi('multi');
        window.localStorage.setItem(
            `lightdash.sqlRunner.lastConnection.${projectUuid}`,
            'finance-uuid',
        );

        renderScope(<SqlRunnerSidebar />, false, null);

        await waitFor(() =>
            expect(selectConnectionRequest(store.getState())).toEqual({
                ready: true,
                field: { warehouseConnectionUuid: null },
            }),
        );
    });

    it('waits for a choice when an explore hint is not in the project', async () => {
        serveApi('multi');
        window.localStorage.setItem(
            `lightdash.sqlRunner.lastConnection.${projectUuid}`,
            'original-uuid',
        );
        store.dispatch(setSql('select * from finance.public.ledger'));
        store.dispatch(
            setFetchResultsOnLoad({
                shouldFetch: true,
                shouldOpenChartOnLoad: false,
            }),
        );
        const runQuery = vi.fn(async () => {});

        renderScope(
            <>
                <SqlRunnerSidebar />
                <AutoRun runQuery={runQuery} />
            </>,
            false,
            'unknown-uuid',
        );

        await screen.findByRole('combobox', { name: 'Active connection' });
        expect(connectionRoute()).toEqual({ route: 'multi', connection: null });
        expect(runQuery).not.toHaveBeenCalled();
    });

    it('keeps the single-project route when given a connection hint', async () => {
        serveApi('single');
        renderScope(<SqlRunnerSidebar />, false, 'finance-uuid');

        await waitFor(() =>
            expect(connectionRoute()).toEqual({ route: 'single' }),
        );
        expect(requestedUrls()).not.toContain(connectionsUrl);
    });

    it('opens a saved chart on its own connection, never on the last used one first', async () => {
        serveApi('multi');
        window.localStorage.setItem(
            `lightdash.sqlRunner.lastConnection.${projectUuid}`,
            'original-uuid',
        );
        const published: unknown[] = [];
        const unsubscribe = store.subscribe(() => {
            published.push(store.getState().sqlRunner.connectionRoute);
        });
        renderScope(<SqlRunnerSidebar />, true);
        await screen.findByRole('combobox', { name: 'Active connection' });
        expect(connectionRoute()).toEqual({ route: 'multi', connection: null });

        store.dispatch(
            setSavedChartData({
                savedSqlUuid: 'chart-uuid',
                name: 'Ledger',
                description: null,
                sql: 'select 1',
                limit: 10,
                config: { type: 'table' },
                warehouseConnectionUuid: 'finance-uuid',
            } as unknown as SqlChart),
        );

        await waitFor(() =>
            expect(connectionRoute()).toMatchObject({
                route: 'multi',
                connection: { warehouseConnectionUuid: 'finance-uuid' },
            }),
        );
        unsubscribe();
        expect(published).not.toContainEqual(
            expect.objectContaining({
                connection: expect.objectContaining({
                    warehouseConnectionUuid: null,
                }),
            }),
        );
    });

    it("renders main's SqlEditor for a single project", async () => {
        serveApi('single');
        renderScope(<SqlRunnerEditor />);

        expect(
            await screen.findByTestId('main-sql-editor'),
        ).toBeInTheDocument();
        expect(SqlEditor).toHaveBeenCalled();
        expect(SqlEditorView).not.toHaveBeenCalled();
    });

    it("never renders main's SqlEditor in a multi project, even before the connections load", async () => {
        serveApi('multi');
        renderScope(<SqlRunnerEditor />);

        expect(
            await screen.findByTestId('sql-editor-view'),
        ).toBeInTheDocument();
        expect(SqlEditor).not.toHaveBeenCalled();
        expect(requestedUrls()).not.toContain(
            `/projects/${projectUuid}/sqlRunner/tables`,
        );
    });

    it('autocompletes the tables and fields of the active connection', async () => {
        serveApi('multi');
        store.dispatch(setSql('select * from `finance`.`public`.`ledger`'));
        const user = renderScope(
            <>
                <SqlRunnerSidebar />
                <SqlRunnerEditor />
            </>,
        );
        await pickFinance(user);

        const lastCatalog = () =>
            vi.mocked(SqlEditorView).mock.lastCall?.[0].catalog;
        await waitFor(() =>
            expect(lastCatalog()?.transformedData).toEqual({
                database: 'finance',
                tablesBySchema: [
                    {
                        schema: 'public',
                        tables: {
                            ledger: { tableType: WarehouseTableType.TABLE },
                        },
                    },
                ],
            }),
        );
        await waitFor(() =>
            expect(lastCatalog()?.detectedTablesFieldData).toEqual([
                {
                    name: 'amount',
                    type: 'number',
                    table: 'ledger',
                    schema: 'public',
                },
            ]),
        );
        expect(requestedUrls()).toContain(financeFieldsUrl);
        expect(requestedUrls()).not.toContain(
            `/projects/${projectUuid}/sqlRunner/tables`,
        );
    });
});
