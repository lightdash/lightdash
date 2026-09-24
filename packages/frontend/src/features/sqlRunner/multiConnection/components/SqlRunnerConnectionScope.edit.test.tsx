import {
    ChartKind,
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
import { HeaderEdit } from '../../components/Header/HeaderEdit';
import { store } from '../../store';
import {
    resetState,
    selectConnectionRequest,
    setProjectUuid,
    setSavedChartData,
} from '../../store/sqlRunnerSlice';
import { SqlRunnerConnectionScope } from './SqlRunnerConnectionScope';
import { SqlRunnerSidebar } from './SqlRunnerSidebar';

const updateSqlChart = vi.fn();

vi.mock('../../../../api', () => ({
    lightdashApi: vi.fn(),
}));

vi.mock('react-router', () => ({
    useNavigate: () => vi.fn(),
    useLocation: () => ({ search: '', pathname: '/' }),
}));

vi.mock('../../hooks/useSavedSqlCharts', () => ({
    useUpdateSqlChartMutation: () => ({
        mutate: updateSqlChart,
        isLoading: false,
    }),
}));

vi.mock('../../../../components/DataViz/store/selectors', () => {
    const config = { type: 'table', metadata: { version: 1 }, columns: {} };
    return {
        selectCompleteConfigByKind: () => config,
        cartesianChartSelectors: { getErrors: () => undefined },
    };
});

vi.mock(
    '../../../../components/Explorer/SavedChartsHeader/TitleBreadcrumbs',
    () => ({ TitleBreadCrumbs: () => null }),
);
vi.mock('../../../../components/common/PageHeader/UpdatedInfo', () => ({
    UpdatedInfo: () => null,
}));
vi.mock(
    '../../../../components/common/ResourceInfoPopup/ResourceInfoPopup',
    () => ({ ResourceInfoPopup: () => null }),
);
vi.mock('../../components/ChartErrorsAlert', () => ({
    ChartErrorsAlert: () => null,
}));
vi.mock('../../components/DeleteSqlChartModal', () => ({
    DeleteSqlChartModal: () => null,
}));
vi.mock('../../components/SaveSqlChartModal', () => ({
    SaveSqlChartModal: () => null,
}));
vi.mock('../../components/UpdateSqlChartModal', () => ({
    UpdateSqlChartModal: () => null,
}));
vi.mock('../../components/SqlQueryBeforeSaveAlert', () => ({
    SqlQueryBeforeSaveAlert: () => null,
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

const chartOnFinance = {
    savedSqlUuid: 'chart-uuid',
    name: 'Ledger',
    description: null,
    slug: 'ledger',
    sql: 'select 1',
    limit: 10,
    config: { type: ChartKind.TABLE },
    project: { projectUuid },
    space: { uuid: 'space-uuid', name: 'Space' },
    warehouseConnectionUuid: 'finance-uuid',
} as unknown as SqlChart;

describe('Editing a saved SQL chart on another connection', () => {
    beforeEach(() => {
        window.localStorage.clear();
        window.localStorage.setItem(
            `lightdash.sqlRunner.lastConnection.${projectUuid}`,
            'original-uuid',
        );
        store.dispatch(resetState());
        store.dispatch(setProjectUuid(projectUuid));
        mockApi.mockImplementation(async ({ url }: { url: string }) => {
            if (url === `/projects/${projectUuid}`) {
                return { projectUuid, connectionRoute: 'multi' };
            }
            if (url === connectionsUrl) return connections;
            if (url.endsWith('/databases')) {
                return { databases: [], truncated: false, limit: 100 };
            }
            throw new Error(`Unexpected request ${url}`);
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('opens the chart on its connection, then a switch to the original publishes the original and saves it as null', async () => {
        store.dispatch(setSavedChartData(chartOnFinance));
        renderWithProviders(
            <Provider store={store}>
                <SqlRunnerConnectionScope isEditingSavedChart>
                    <SqlRunnerSidebar />
                    <HeaderEdit />
                </SqlRunnerConnectionScope>
            </Provider>,
        );
        await waitFor(() =>
            expect(selectConnectionRequest(store.getState())).toEqual({
                ready: true,
                field: { warehouseConnectionUuid: 'finance-uuid' },
            }),
        );
        const user = userEvent.setup();

        await user.click(
            await screen.findByRole('combobox', { name: 'Active connection' }),
        );
        await user.click(
            await screen.findByRole('option', { name: 'Warehouse' }),
        );

        await waitFor(() =>
            expect(selectConnectionRequest(store.getState())).toEqual({
                ready: true,
                field: { warehouseConnectionUuid: null },
            }),
        );
        const save = screen.getByRole('button', { name: 'Save' });
        await waitFor(() => expect(save).toBeEnabled());
        await user.click(save);

        expect(updateSqlChart).toHaveBeenCalledWith({
            versionedData: expect.objectContaining({
                warehouseConnectionUuid: null,
            }),
        });
    });
});
