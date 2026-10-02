import {
    WarehouseTableType,
    WarehouseTypes,
    type WarehouseDatabaseListing,
    type WarehouseTablesCatalog,
} from '@lightdash/common';
import { waitFor } from '@testing-library/react';
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
import {
    SqlEditorView,
    type SqlEditorCatalog,
} from '../../components/SqlEditor';
import { store } from '../../store';
import { resetState, setProjectUuid } from '../../store/sqlRunnerSlice';
import {
    ActiveConnectionContext,
    type ActiveConnection,
} from '../hooks/activeConnectionContext';
import { MultiConnectionSqlEditor } from './MultiConnectionSqlEditor';

vi.mock('../../../../api', () => ({
    lightdashApi: vi.fn(),
}));

vi.mock('../../components/SqlEditor', () => ({
    SqlEditorView: vi.fn(() => null),
}));

const mockApi = lightdashApi as unknown as Mock;
const mockEditor = SqlEditorView as unknown as Mock;
const projectUuid = 'project-uuid';
const connectionUuid = 'athena-uuid';
const connectionUrl = `/projects/${projectUuid}/sqlRunner/connections/${connectionUuid}`;

const activeConnection: ActiveConnection = {
    projectUuid,
    connections: [
        {
            warehouseConnectionUuid: connectionUuid,
            name: 'Athena',
            isOriginal: true,
            warehouseType: WarehouseTypes.ATHENA,
        },
    ],
    hasSeveralConnections: false,
    isConnectionSettled: true,
    activeConnectionUuid: connectionUuid,
    activeConnection: undefined,
    connectionNameFor: () => 'Athena',
    switchConnection: () => undefined,
    activeTable: undefined,
    setActiveTable: () => undefined,
};

const serveApi = (
    listing: WarehouseDatabaseListing,
    tablesByListedName: Record<string, WarehouseTablesCatalog>,
) =>
    mockApi.mockImplementation(async ({ url }: { url: string }) => {
        if (url === `${connectionUrl}/databases`) return listing;
        const listedName = Object.keys(tablesByListedName).find(
            (name) =>
                url ===
                `${connectionUrl}/tables?${new URLSearchParams({
                    database: name,
                }).toString()}`,
        );
        if (listedName !== undefined) return tablesByListedName[listedName];
        throw new Error(`Unexpected request ${url}`);
    });

const renderEditor = () =>
    renderWithProviders(
        <Provider store={store}>
            <ActiveConnectionContext.Provider value={activeConnection}>
                <MultiConnectionSqlEditor />
            </ActiveConnectionContext.Provider>
        </Provider>,
    );

const lastCatalog = (): SqlEditorCatalog | undefined =>
    (mockEditor.mock.lastCall?.[0] as { catalog: SqlEditorCatalog } | undefined)
        ?.catalog;

describe('MultiConnectionSqlEditor', () => {
    beforeEach(() => {
        store.dispatch(resetState());
        store.dispatch(setProjectUuid(projectUuid));
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('gives the editor the Athena tables when the listed name differs from the catalog', async () => {
        serveApi(
            {
                databases: [
                    {
                        name: 'sales_glue',
                        database: 'AwsDataCatalog',
                        schema: 'sales_glue',
                        isDefault: true,
                    },
                ],
                truncated: false,
                limit: 100,
            },
            {
                sales_glue: {
                    AwsDataCatalog: {
                        sales_glue: {
                            orders: { tableType: WarehouseTableType.TABLE },
                        },
                    },
                },
            },
        );
        renderEditor();

        await waitFor(() =>
            expect(lastCatalog()?.transformedData).toEqual({
                database: 'AwsDataCatalog',
                tablesBySchema: [
                    {
                        schema: 'sales_glue',
                        tables: {
                            orders: { tableType: WarehouseTableType.TABLE },
                        },
                    },
                ],
            }),
        );
        expect(mockApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: `${connectionUrl}/tables?database=sales_glue`,
            }),
        );
    });

    it('gives the editor the tables when the listed name is the database', async () => {
        serveApi(
            {
                databases: [
                    {
                        name: 'finance',
                        database: 'finance',
                        schema: null,
                        isDefault: true,
                    },
                ],
                truncated: false,
                limit: 100,
            },
            {
                finance: {
                    finance: {
                        public: {
                            ledger: { tableType: WarehouseTableType.TABLE },
                        },
                    },
                },
            },
        );
        renderEditor();

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
    });
});
