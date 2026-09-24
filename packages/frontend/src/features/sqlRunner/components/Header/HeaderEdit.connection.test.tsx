import { ChartKind, WarehouseTypes, type SqlChart } from '@lightdash/common';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { store } from '../../store';
import {
    resetState,
    setConnectionRoute,
    setSavedChartData,
    setSql,
} from '../../store/sqlRunnerSlice';
import { HeaderEdit } from './HeaderEdit';

const updateSqlChart = vi.fn();

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
vi.mock('../ChartErrorsAlert', () => ({ ChartErrorsAlert: () => null }));
vi.mock('../DeleteSqlChartModal', () => ({ DeleteSqlChartModal: () => null }));
vi.mock('../SaveSqlChartModal', () => ({ SaveSqlChartModal: () => null }));
vi.mock('../UpdateSqlChartModal', () => ({ UpdateSqlChartModal: () => null }));
vi.mock('../SqlQueryBeforeSaveAlert', () => ({
    SqlQueryBeforeSaveAlert: () => null,
}));

const savedChart = {
    savedSqlUuid: 'chart-uuid',
    name: 'Ledger',
    description: null,
    slug: 'ledger',
    sql: 'select 1',
    limit: 10,
    config: { type: ChartKind.TABLE },
    project: { projectUuid: 'project-uuid' },
    space: { uuid: 'space-uuid', name: 'Space' },
    warehouseConnectionUuid: 'finance-uuid',
} as unknown as SqlChart;

describe('HeaderEdit and the connection of a saved SQL chart', () => {
    beforeEach(() => {
        store.dispatch(resetState());
        store.dispatch(setSavedChartData(savedChart));
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('moves a chart back to the original with an explicit null', async () => {
        store.dispatch(
            setConnectionRoute({
                route: 'multi',
                connection: {
                    warehouseConnectionUuid: 'finance-uuid',
                    name: 'Finance',
                    warehouseType: WarehouseTypes.POSTGRES,
                },
            }),
        );
        renderWithProviders(
            <Provider store={store}>
                <HeaderEdit />
            </Provider>,
        );
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

        act(() => {
            store.dispatch(
                setConnectionRoute({
                    route: 'multi',
                    connection: {
                        warehouseConnectionUuid: null,
                        name: 'Warehouse',
                        warehouseType: WarehouseTypes.POSTGRES,
                    },
                }),
            );
        });
        await userEvent
            .setup()
            .click(screen.getByRole('button', { name: 'Save' }));

        expect(updateSqlChart).toHaveBeenCalledWith({
            versionedData: expect.objectContaining({
                warehouseConnectionUuid: null,
            }),
        });
    });

    it("sends main's versioned data with no connection field in a single project", async () => {
        store.dispatch(setConnectionRoute({ route: 'single' }));
        renderWithProviders(
            <Provider store={store}>
                <HeaderEdit />
            </Provider>,
        );
        act(() => {
            store.dispatch(setSql('select 2'));
        });

        await userEvent
            .setup()
            .click(screen.getByRole('button', { name: 'Save' }));

        expect(updateSqlChart).toHaveBeenCalledWith({
            versionedData: {
                config: {
                    type: 'table',
                    metadata: { version: 1 },
                    columns: {},
                },
                sql: 'select 2',
                limit: 10,
            },
        });
    });
});
