import {
    ChartType,
    QuerySourceType,
    WarehouseTypes,
    type SavedChart,
} from '@lightdash/common';
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

const addVersion = vi.fn();

vi.mock('react-router', () => ({
    useNavigate: () => vi.fn(),
    useLocation: () => ({ search: '', pathname: '/' }),
}));

vi.mock('../../../../hooks/useSavedQuery', () => ({
    useAddVersionMutation: () => ({
        mutate: addVersion,
        isLoading: false,
    }),
}));

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
vi.mock('../DeleteSqlChartModal', () => ({ DeleteSqlChartModal: () => null }));
vi.mock('../SaveSqlChartModal', () => ({ SaveSqlChartModal: () => null }));
vi.mock('../UpdateSqlChartModal', () => ({ UpdateSqlChartModal: () => null }));
vi.mock('../SqlQueryBeforeSaveAlert', () => ({
    SqlQueryBeforeSaveAlert: () => null,
}));

const savedChart = {
    uuid: 'chart-uuid',
    name: 'Ledger',
    description: undefined,
    slug: 'ledger',
    projectUuid: 'project-uuid',
    spaceUuid: 'space-uuid',
    spaceName: 'Space',
    tableName: 'sql',
    metricQuery: {
        exploreName: 'sql',
        dimensions: [],
        metrics: [],
        filters: {},
        sorts: [],
        limit: 10,
        tableCalculations: [],
    },
    chartConfig: { type: ChartType.TABLE, config: undefined },
    tableConfig: { columnOrder: [] },
    pipeline: {
        queries: [
            {
                sourceType: QuerySourceType.SQL,
                nodeId: 'sql',
                title: 'SQL',
                sql: 'select 1',
                limit: 10,
                warehouseConnectionUuid: 'finance-uuid',
            },
        ],
        terminalNodeId: 'sql',
        columns: {},
    },
} as unknown as SavedChart;

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

        expect(addVersion).toHaveBeenCalledTimes(1);
        const { uuid, payload } = addVersion.mock.calls[0][0];
        expect(uuid).toBe('chart-uuid');
        expect(payload.pipeline.queries[0]).not.toHaveProperty(
            'warehouseConnectionUuid',
        );
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

        expect(addVersion).toHaveBeenCalledWith({
            uuid: 'chart-uuid',
            payload: expect.objectContaining({
                chartConfig: { type: ChartType.TABLE, config: undefined },
                pipeline: expect.objectContaining({
                    queries: [
                        {
                            sourceType: QuerySourceType.SQL,
                            nodeId: 'sql',
                            title: 'SQL',
                            sql: 'select 2',
                            limit: 10,
                        },
                    ],
                }),
            }),
        });
    });

    it('does not save a change while no connection is chosen', async () => {
        store.dispatch(
            setConnectionRoute({ route: 'multi', connection: null }),
        );
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

        expect(addVersion).not.toHaveBeenCalled();
    });
});
