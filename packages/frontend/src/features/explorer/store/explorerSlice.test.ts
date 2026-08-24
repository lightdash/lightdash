import { ChartType, type TableCalculation } from '@lightdash/common';
import { defaultState } from '../../../providers/Explorer/defaultState';
import { explorerActions, explorerReducer } from './explorerSlice';

describe('explorerSlice pivot axis updates', () => {
    it('preserves both axis changes when moving a row dimension to columns', () => {
        const initialState = explorerReducer(
            undefined,
            explorerActions.setPivotConfig({
                columns: ['months_since_start'],
                rows: ['cohort_month', 'plan_name'],
            }),
        );

        const withUpdatedColumns = explorerReducer(
            initialState,
            explorerActions.setPivotColumns([
                'months_since_start',
                'plan_name',
            ]),
        );
        const result = explorerReducer(
            withUpdatedColumns,
            explorerActions.setPivotRows(['cohort_month']),
        );

        expect(result.unsavedChartVersion.pivotConfig).toEqual({
            columns: ['months_since_start', 'plan_name'],
            rows: ['cohort_month'],
        });
    });

    it('preserves both axis changes when moving a column dimension to rows', () => {
        const initialState = explorerReducer(
            undefined,
            explorerActions.setPivotConfig({
                columns: ['months_since_start', 'plan_name'],
                rows: ['cohort_month'],
            }),
        );

        const withUpdatedColumns = explorerReducer(
            initialState,
            explorerActions.setPivotColumns(['months_since_start']),
        );
        const result = explorerReducer(
            withUpdatedColumns,
            explorerActions.setPivotRows(['cohort_month', 'plan_name']),
        );

        expect(result.unsavedChartVersion.pivotConfig).toEqual({
            columns: ['months_since_start'],
            rows: ['cohort_month', 'plan_name'],
        });
    });
});

describe('explorerSlice table calculation updates', () => {
    const tableCalculation: TableCalculation = {
        name: 'revenue_growth',
        displayName: 'Revenue growth',
        sql: '${orders.revenue}',
    };

    it.each([
        {
            name: 'adding',
            action: explorerActions.addTableCalculation(tableCalculation),
        },
        {
            name: 'updating',
            action: explorerActions.updateTableCalculation({
                oldName: tableCalculation.name,
                tableCalculation: {
                    ...tableCalculation,
                    sql: '${orders.net_revenue}',
                },
            }),
        },
        {
            name: 'deleting',
            action: explorerActions.deleteTableCalculation(
                tableCalculation.name,
            ),
        },
    ])('requests a query after $name a calculation', ({ action }) => {
        const result = explorerReducer(undefined, action);

        expect(result.queryExecution.pendingFetch).toBe(true);
    });
});

describe('explorerSlice chart type authoring', () => {
    const fromChoose = explorerReducer(
        explorerReducer(undefined, explorerActions.openVisualizationConfig()),
        explorerActions.setChartSidebarStep('choose'),
    );
    const authoringNew = explorerReducer(
        fromChoose,
        explorerActions.startChartTypeAuthoring({ dataAppVizUuid: null }),
    );

    it('moves a new type onto the empty custom config and shows Configure', () => {
        expect(authoringNew.chartTypeAuthoring).toEqual({
            dataAppVizUuid: null,
            createdInSession: false,
            previous: {
                chartSidebarStep: 'choose',
                chartConfig: fromChoose.unsavedChartVersion.chartConfig,
                pivotConfig: undefined,
            },
        });
        expect(authoringNew.unsavedChartVersion.chartConfig).toEqual({
            type: ChartType.DATA_APP_VIZ,
            config: { dataAppVizUuid: '', fieldMapping: {}, optionValues: {} },
        });
        expect(authoringNew.chartSidebarStep).toBe('configure');
        expect(authoringNew.isVisualizationConfigOpen).toBe(true);
        expect(
            authoringNew.cachedChartConfigs[ChartType.CARTESIAN]?.chartConfig,
        ).toEqual(fromChoose.unsavedChartVersion.chartConfig.config);
    });

    it('keeps the chart as it is when revising an existing type', () => {
        const revising = explorerReducer(
            fromChoose,
            explorerActions.startChartTypeAuthoring({
                dataAppVizUuid: 'viz-1',
            }),
        );
        expect(revising.unsavedChartVersion.chartConfig).toEqual(
            fromChoose.unsavedChartVersion.chartConfig,
        );
        expect(revising.chartSidebarStep).toBe('configure');
    });

    it('hands the session the app a first build claims, once', () => {
        const claimed = explorerReducer(
            authoringNew,
            explorerActions.claimChartTypeAuthoringViz('viz-1'),
        );
        expect(claimed.chartTypeAuthoring?.dataAppVizUuid).toBe('viz-1');
        expect(claimed.chartTypeAuthoring?.createdInSession).toBe(true);

        const reclaimed = explorerReducer(
            claimed,
            explorerActions.claimChartTypeAuthoringViz('viz-2'),
        );
        expect(reclaimed.chartTypeAuthoring?.dataAppVizUuid).toBe('viz-1');
        expect(
            explorerReducer(
                undefined,
                explorerActions.claimChartTypeAuthoringViz('viz-1'),
            ).chartTypeAuthoring,
        ).toBeNull();
    });

    it('cancels back to the chart and the step it left', () => {
        const cancelled = explorerReducer(
            authoringNew,
            explorerActions.cancelChartTypeAuthoring(),
        );

        expect(cancelled.chartTypeAuthoring).toBeNull();
        expect(cancelled.unsavedChartVersion.chartConfig).toEqual(
            fromChoose.unsavedChartVersion.chartConfig,
        );
        expect(cancelled.isVisualizationConfigOpen).toBe(true);
        expect(cancelled.chartSidebarStep).toBe('choose');
    });

    it('finishes on the configuration of the authored type', () => {
        const finished = explorerReducer(
            authoringNew,
            explorerActions.finishChartTypeAuthoring(),
        );

        expect(finished.chartTypeAuthoring).toBeNull();
        expect(finished.unsavedChartVersion.chartConfig.type).toBe(
            ChartType.DATA_APP_VIZ,
        );
        expect(finished.isVisualizationConfigOpen).toBe(true);
        expect(finished.chartSidebarStep).toBe('configure');
    });

    it('ignores finish when nothing is being authored', () => {
        const closed = explorerReducer(
            explorerReducer(
                undefined,
                explorerActions.closeVisualizationConfig(),
            ),
            explorerActions.finishChartTypeAuthoring(),
        );
        expect(closed.isVisualizationConfigOpen).toBe(false);
    });

    it('drops restored pivot columns the query no longer has', () => {
        const pivoted = explorerReducer(
            explorerReducer(
                fromChoose,
                explorerActions.setPivotConfig({ columns: ['orders_status'] }),
            ),
            explorerActions.startChartTypeAuthoring({
                dataAppVizUuid: 'viz-1',
            }),
        );
        const cancelled = explorerReducer(
            pivoted,
            explorerActions.cancelChartTypeAuthoring(),
        );
        expect(cancelled.unsavedChartVersion.pivotConfig).toBeUndefined();
    });

    it('returns the sidebar to Configure when it closes', () => {
        const closed = explorerReducer(
            fromChoose,
            explorerActions.closeVisualizationConfig(),
        );

        expect(closed.isVisualizationConfigOpen).toBe(false);
        expect(closed.chartSidebarStep).toBe('configure');
    });

    it('survives clearing the query', () => {
        const cleared = explorerReducer(
            authoringNew,
            explorerActions.clearQuery({ defaultState, tableName: 'orders' }),
        );

        expect(cleared.chartTypeAuthoring).toEqual(
            authoringNew.chartTypeAuthoring,
        );
        expect(cleared.chartSidebarStep).toBe('configure');
        expect(cleared.unsavedChartVersion.tableName).toBe('orders');
    });
});
