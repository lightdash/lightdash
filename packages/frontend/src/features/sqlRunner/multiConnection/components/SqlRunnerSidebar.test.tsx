import {
    WarehouseTableType,
    WarehouseTypes,
    type SqlRunnerWarehouseConnection,
} from '@lightdash/common';
import { screen, waitFor, within } from '@testing-library/react';
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
import { Sidebar } from '../../components/Sidebar';
import { store } from '../../store';
import { resetState, setProjectUuid } from '../../store/sqlRunnerSlice';
import { SqlRunnerSidebar } from './SqlRunnerSidebar';

vi.mock('../../../../api', () => ({
    lightdashApi: vi.fn(),
}));

vi.mock('../../components/Sidebar', () => ({
    Sidebar: vi.fn(() => <div data-testid="main-sidebar" />),
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
        warehouseType: WarehouseTypes.POSTGRES,
    },
];

const listing = (database: string) => ({
    databases: [{ name: database, database, schema: null, isDefault: true }],
    truncated: false,
    limit: 100,
});

const tables = (database: string, table: string) => ({
    [database]: {
        public: {
            [table]: { tableType: WarehouseTableType.TABLE },
        },
    },
});

const serveApi = (connectionRoute: 'single' | 'multi') =>
    mockApi.mockImplementation(async ({ url }: { url: string }) => {
        if (url === `/projects/${projectUuid}`) {
            return { projectUuid, connectionRoute };
        }
        if (url === connectionsUrl) return connections;
        if (url === `${connectionsUrl}/original-uuid/databases`) {
            return listing('warehouse');
        }
        if (url === `${connectionsUrl}/finance-uuid/databases`) {
            return listing('finance');
        }
        if (url === `${connectionsUrl}/finance-uuid/tables?database=finance`) {
            return tables('finance', 'ledger');
        }
        if (
            url ===
            `${connectionsUrl}/finance-uuid/fields?databaseName=finance&schemaName=public&tableName=ledger`
        ) {
            return { amount: 'number' };
        }
        throw new Error(`Unexpected request ${url}`);
    });

const renderSidebar = () => {
    renderWithProviders(
        <Provider store={store}>
            <SqlRunnerSidebar />
        </Provider>,
    );
    return userEvent.setup();
};

const requestedUrls = (): string[] =>
    mockApi.mock.calls.map((call) => (call[0] as { url: string }).url);

const loaders = () => document.querySelectorAll('.mantine-Loader-root');

describe('SqlRunnerSidebar', () => {
    beforeEach(() => {
        window.localStorage.clear();
        store.dispatch(resetState());
        store.dispatch(setProjectUuid(projectUuid));
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("renders main's Sidebar component for a single project", async () => {
        serveApi('single');
        renderSidebar();

        expect(await screen.findByTestId('main-sidebar')).toBeInTheDocument();
        expect(Sidebar).toHaveBeenCalled();
        expect(screen.queryByText('Tables')).not.toBeInTheDocument();
        expect(requestedUrls()).not.toContain(connectionsUrl);
    });

    it("falls back to main's Sidebar when the connections endpoint says the project is single", async () => {
        mockApi.mockImplementation(async ({ url }: { url: string }) => {
            if (url === `/projects/${projectUuid}`) {
                return { projectUuid, connectionRoute: 'multi' };
            }
            throw {
                status: 'error',
                error: {
                    name: 'SingleConnectionProjectError',
                    statusCode: 409,
                    message: 'This project uses a single warehouse connection.',
                },
            };
        });
        renderSidebar();

        expect(await screen.findByTestId('main-sidebar')).toBeInTheDocument();
    });

    describe('with two connections and none picked', () => {
        it('shows the choose-a-connection state and no loader in the sidebar, the tables panel or the fields panel', async () => {
            serveApi('multi');
            renderSidebar();

            expect(
                await screen.findByText(
                    'Choose a connection to browse its tables',
                ),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('combobox', { name: 'Active connection' }),
            ).toHaveValue('');
            expect(screen.queryByTestId('main-sidebar')).toBeNull();
            expect(screen.queryByText('No table selected')).toBeNull();
            await waitFor(() => expect(loaders()).toHaveLength(0));
            expect(requestedUrls()).not.toContain(
                `${connectionsUrl}/original-uuid/databases`,
            );
        });

        it('lists a connection opened in the tree without waiting for a pick', async () => {
            serveApi('multi');
            const user = renderSidebar();

            await user.click(
                await screen.findByRole('button', { name: 'Finance' }),
            );

            await waitFor(() => expect(loaders()).toHaveLength(0));
            expect(screen.queryByText('Loading tables...')).toBeNull();
            expect(requestedUrls()).toContain(
                `${connectionsUrl}/finance-uuid/databases`,
            );
            expect(await screen.findByText('finance')).toBeInTheDocument();
        });
    });

    it('loads the tree and the fields of a clicked table on the picked connection', async () => {
        serveApi('multi');
        const user = renderSidebar();

        await user.click(
            await screen.findByRole('combobox', { name: 'Active connection' }),
        );
        await user.click(
            await screen.findByRole('option', { name: 'Finance' }),
        );

        await user.click(await screen.findByText('public'));
        await user.click(await screen.findByText('ledger'));

        expect(store.getState().sqlRunner.sql).toBe(
            'SELECT * FROM "finance"."public"."ledger" ',
        );
        const fieldsPanel = await screen.findByPlaceholderText('Search fields');
        expect(fieldsPanel).toBeInTheDocument();
        expect(await screen.findByText('amount')).toBeInTheDocument();
        await waitFor(() => expect(loaders()).toHaveLength(0));
        expect(
            within(document.body).queryByText(
                'Choose a connection to browse its tables',
            ),
        ).toBeNull();
        expect(
            window.localStorage.getItem(
                `lightdash.sqlRunner.lastConnection.${projectUuid}`,
            ),
        ).toBe('finance-uuid');
    });
});
