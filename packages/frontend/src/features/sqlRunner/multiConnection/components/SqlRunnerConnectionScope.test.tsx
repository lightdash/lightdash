import {
    WarehouseTableType,
    PersonSignInProvider,
    WarehouseTypes,
    type SqlChart,
    type SqlRunnerWarehouseConnection,
} from '@lightdash/common';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLayoutEffect } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type Mock,
} from 'vitest';
import { sharedLightdashApi } from '../../../../api';
import { useSharedSignInStatusListener } from '../../../../components/NavBar/useSharedSignInStatusListener';
import {
    activateWarehouseSignInPreflight,
    WarehouseSignInPreflight,
    WarehouseSignInPreflightContext,
} from '../../../../components/NavBar/warehouseSignInPreflight';
import { renderWithProviders } from '../../../../testing/testUtils';
import { executeSqlQuery } from '../../../queryRunner/executeQuery';
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
    setState,
} from '../../store/sqlRunnerSlice';
import { prepareAndFetchChartData, runSqlQuery } from '../../store/thunks';
import { SqlRunnerConnectionScope } from './SqlRunnerConnectionScope';
import { SqlRunnerSidebar } from './SqlRunnerSidebar';

vi.mock('../../../../api');

vi.mock('../../../queryRunner/executeQuery', () => ({
    executeSqlQuery: vi.fn(async () => ({
        queryUuid: 'query-uuid',
        fileUrl: '/results',
        results: [],
        columns: [],
    })),
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

const mockApi = sharedLightdashApi as unknown as Mock;
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
const runSharedQuery = async (sql: string) => {
    await store.dispatch(
        runSqlQuery({
            sql,
            limit: 10,
            projectUuid,
            parameterValues: {},
        }),
    );
};
const SharedQueryRunner = () => {
    useRunQueryOnLoad({ runQuery: runSharedQuery, hasQueryResults: false });
    return null;
};
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

    it('uses a valid shared connection hint and ignores the last-used connection', async () => {
        serveApi('multi');
        store.dispatch(
            setState({
                ...store.getState().sqlRunner,
                sql: 'select 1',
                fetchResultsOnLoad: true,
            }),
        );
        window.localStorage.setItem(
            `lightdash.sqlRunner.lastConnection.${projectUuid}`,
            'original-uuid',
        );
        renderWithProviders(
            <Provider store={store}>
                <SqlRunnerConnectionScope
                    isEditingSavedChart={false}
                    isSharedLink
                    sharedConnectionUuid="finance-uuid"
                >
                    <SqlRunnerSidebar />
                    <SharedQueryRunner />
                </SqlRunnerConnectionScope>
            </Provider>,
        );
        await waitFor(() =>
            expect(connectionRoute()).toMatchObject({
                route: 'multi',
                connection: { warehouseConnectionUuid: 'finance-uuid' },
            }),
        );
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
    });

    it('leaves an unknown shared connection unselected', async () => {
        serveApi('multi');
        store.dispatch(
            setState({
                ...store.getState().sqlRunner,
                sql: 'select 1',
                fetchResultsOnLoad: false,
            }),
        );
        window.localStorage.setItem(
            `lightdash.sqlRunner.lastConnection.${projectUuid}`,
            'original-uuid',
        );
        renderWithProviders(
            <Provider store={store}>
                <SqlRunnerConnectionScope
                    isEditingSavedChart={false}
                    isSharedLink
                    sharedConnectionUuid="missing-uuid"
                >
                    <SqlRunnerSidebar />
                    <SharedQueryRunner />
                </SqlRunnerConnectionScope>
            </Provider>,
        );
        await screen.findByText('Choose a connection to browse its tables');
        expect(connectionRoute()).toEqual({ route: 'multi', connection: null });
        expect(executeSqlQuery).not.toHaveBeenCalled();
        expect(store.getState().sqlRunner.fetchResultsOnLoad).toBe(false);
        await pickFinance(userEvent.setup());
        expect(executeSqlQuery).not.toHaveBeenCalled();
    });

    it('names the connection and the navigation switcher when credentials are missing', async () => {
        serveApi('multi');
        mockApi.mockImplementation(async ({ url }: { url: string }) => {
            if (url === `/projects/${projectUuid}`)
                return { projectUuid, connectionRoute: 'multi' };
            if (url === connectionsUrl) return connections;
            if (url.endsWith('/databases'))
                throw {
                    status: 'error',
                    error: {
                        name: 'MissingCredentialsError',
                        message:
                            "You don't have warehouse credentials set up for this project.",
                        statusCode: 403,
                        data: {},
                    },
                };
            throw new Error(`Unexpected request ${url}`);
        });
        const user = renderScope(<SqlRunnerSidebar />);
        await pickFinance(user);
        expect(
            await screen.findByText(
                /Finance.*Add or select them in the credentials switcher in the navigation bar/i,
            ),
        ).toBeInTheDocument();
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

const BoundStatusListener = ({
    preflight,
}: {
    preflight: WarehouseSignInPreflight;
}) => {
    useLayoutEffect(
        () => activateWarehouseSignInPreflight(preflight),
        [preflight],
    );
    useSharedSignInStatusListener({
        reconnectEnabled: true,
        flagsLoading: false,
    });
    return null;
};

test.each([false, true])(
    'real SQL scope discovers an extra connection before status and gates on-load, manual and pivot execution with expired=%s',
    async (expired) => {
        vi.clearAllMocks();
        window.localStorage.clear();
        store.dispatch(resetState());
        store.dispatch(setProjectUuid(projectUuid));
        store.dispatch(setSql('select 1'));
        store.dispatch(
            setFetchResultsOnLoad({
                shouldFetch: true,
                shouldOpenChartOnLoad: false,
            }),
        );
        serveApi('multi');
        const metadata = mockApi.getMockImplementation()!;
        const catalogue =
            Promise.withResolvers<SqlRunnerWarehouseConnection[]>();
        const status = Promise.withResolvers<unknown>();
        mockApi.mockImplementation((request: { url: string }) => {
            if (request.url === connectionsUrl) return catalogue.promise;
            if (request.url.includes('shared-sign-in')) return status.promise;
            return metadata(request);
        });
        const preflight = new WarehouseSignInPreflight(
            { projectUuid, userUuid: 'user_a', pageGeneration: 'page_a' },
            true,
            false,
        );
        renderWithProviders(
            <Provider store={store}>
                <MemoryRouter>
                    <WarehouseSignInPreflightContext.Provider value={preflight}>
                        <BoundStatusListener preflight={preflight} />
                        <SqlRunnerConnectionScope
                            isEditingSavedChart={false}
                            connectionHint="finance-uuid"
                        >
                            <SharedQueryRunner />
                        </SqlRunnerConnectionScope>
                    </WarehouseSignInPreflightContext.Provider>
                </MemoryRouter>
            </Provider>,
        );
        await waitFor(() => expect(requestedUrls()).toContain(connectionsUrl));
        expect(preflight.checks.size).toBe(0);
        expect(
            requestedUrls().some((url) => url.includes('shared-sign-in')),
        ).toBe(false);
        expect(executeSqlQuery).not.toHaveBeenCalled();
        await act(async () => catalogue.resolve(connections));
        await waitFor(() =>
            expect(
                requestedUrls().filter((url) => url.includes('shared-sign-in')),
            ).toEqual([
                `/projects/${projectUuid}/warehouse-credentials/shared-sign-in?includePersonal=true&warehouseConnectionUuid=finance-uuid`,
            ]),
        );
        expect(preflight.checks.has('original')).toBe(false);
        const manual = await store.dispatch(
            runSqlQuery({
                sql: 'select 1',
                limit: 10,
                projectUuid,
                parameterValues: {},
            }),
        );
        const pivot = await store.dispatch(
            prepareAndFetchChartData({ forceRefresh: true }),
        );
        expect(
            runSqlQuery.rejected.match(manual) && manual.meta.condition,
        ).toBe(true);
        expect(
            prepareAndFetchChartData.rejected.match(pivot) &&
                pivot.meta.condition,
        ).toBe(true);
        expect(executeSqlQuery).not.toHaveBeenCalled();
        await act(async () =>
            status.resolve({
                personalSelection: { warehouseConnectionUuid: 'finance-uuid' },
                provider: PersonSignInProvider.GOOGLE,
                subject: null,
                subjectBasis: null,
                expired: false,
                canReconnect: false,
                personalSignIn: {
                    projectUuid,
                    provider: PersonSignInProvider.GOOGLE,
                    userWarehouseCredentialsUuid: 'credential_extra',
                    expired,
                    canReconnect: true,
                },
            }),
        );
        if (expired) {
            await waitFor(() => expect(preflight.modalOpen).toBe(true));
            expect(executeSqlQuery).not.toHaveBeenCalled();
            act(() => preflight.dismiss(preflight.target!));
        }
        await waitFor(() => expect(executeSqlQuery).toHaveBeenCalledOnce());
        expect(vi.mocked(executeSqlQuery).mock.calls[0][6]).toBe(
            'finance-uuid',
        );
    },
);
