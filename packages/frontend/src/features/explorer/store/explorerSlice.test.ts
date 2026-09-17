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

    it('moves a new type onto a chart with no viz yet and shows Configure', () => {
        expect(authoringNew.chartTypeAuthoring).toEqual({
            dataAppVizUuid: null,
            viewedVersion: null,
            createdInSession: false,
            previous: {
                chartSidebarStep: 'choose',
                chartConfig: fromChoose.unsavedChartVersion.chartConfig,
                pivotConfig: undefined,
            },
        });
        expect(authoringNew.unsavedChartVersion.chartConfig).toStrictEqual({
            type: ChartType.DATA_APP_VIZ,
        });
        expect(authoringNew.chartSidebarStep).toBe('configure');
        expect(authoringNew.isVisualizationConfigOpen).toBe(true);
        expect(
            authoringNew.cachedChartConfigs[ChartType.CARTESIAN]?.chartConfig,
        ).toEqual(fromChoose.unsavedChartVersion.chartConfig.config);
    });

    it('switches away from a chart with no viz without a config to cache', () => {
        const switched = explorerReducer(
            authoringNew,
            explorerActions.setChartType({ chartType: ChartType.TABLE }),
        );

        expect(switched.unsavedChartVersion.chartConfig.type).toBe(
            ChartType.TABLE,
        );
        expect(
            switched.cachedChartConfigs[ChartType.DATA_APP_VIZ]?.chartConfig,
        ).toBeUndefined();
    });

    it('comes back to no viz after visiting another type', () => {
        const back = explorerReducer(
            explorerReducer(
                authoringNew,
                explorerActions.setChartType({ chartType: ChartType.TABLE }),
            ),
            explorerActions.setChartType({ chartType: ChartType.DATA_APP_VIZ }),
        );

        expect(back.unsavedChartVersion.chartConfig).toStrictEqual({
            type: ChartType.DATA_APP_VIZ,
        });
    });

    it('starts a new type again from a chart with no viz', () => {
        const again = explorerReducer(
            authoringNew,
            explorerActions.startChartTypeAuthoring({ dataAppVizUuid: null }),
        );

        expect(again.unsavedChartVersion.chartConfig).toStrictEqual({
            type: ChartType.DATA_APP_VIZ,
        });
    });

    it('points at no viz through setChartConfig even with a viz cached', () => {
        const vizConfig = {
            dataAppVizUuid: 'viz-1',
            fieldMapping: {},
            optionValues: {},
        };
        const onViz = explorerReducer(
            fromChoose,
            explorerActions.setChartConfig({
                chartConfig: {
                    type: ChartType.DATA_APP_VIZ,
                    config: vizConfig,
                },
            }),
        );
        const created = [
            explorerActions.setChartType({ chartType: ChartType.DATA_APP_VIZ }),
            explorerActions.setChartConfig({
                chartConfig: { type: ChartType.DATA_APP_VIZ },
            }),
        ].reduce(explorerReducer, onViz);

        expect(
            created.cachedChartConfigs[ChartType.DATA_APP_VIZ]?.chartConfig,
        ).toEqual(vizConfig);
        expect(created.unsavedChartVersion.chartConfig).toStrictEqual({
            type: ChartType.DATA_APP_VIZ,
        });
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

    it('tracks the version the builder previews, only while authoring', () => {
        const pinned = explorerReducer(
            authoringNew,
            explorerActions.viewChartTypeAuthoringVersion(2),
        );
        expect(pinned.chartTypeAuthoring?.viewedVersion).toBe(2);

        const unpinned = explorerReducer(
            pinned,
            explorerActions.viewChartTypeAuthoringVersion(null),
        );
        expect(unpinned.chartTypeAuthoring?.viewedVersion).toBeNull();

        expect(
            explorerReducer(
                undefined,
                explorerActions.viewChartTypeAuthoringVersion(2),
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

    it.each(['choose', 'configure'] as const)(
        'returns to %s after editing an existing type',
        (step) => {
            const entered = explorerReducer(
                explorerReducer(
                    fromChoose,
                    explorerActions.setChartSidebarStep(step),
                ),
                explorerActions.startChartTypeAuthoring({
                    dataAppVizUuid: 'viz-1',
                }),
            );
            const finished = explorerReducer(
                entered,
                explorerActions.finishChartTypeAuthoring(),
            );
            expect(finished.chartSidebarStep).toBe(step);
            expect(finished.chartTypeAuthoring).toBeNull();
            expect(finished.isVisualizationConfigOpen).toBe(true);
        },
    );

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

describe('explorerSlice saved chart metadata', () => {
    const savedChart = {
        uuid: 'chart-uuid',
        name: 'Old name',
        description: 'Old description',
        pinnedListUuid: null,
        verification: null,
        colorPaletteUuid: 'saved-palette',
        metricQuery: { metrics: ['orders_count'] },
    } as unknown as Parameters<typeof explorerActions.setSavedChartMetadata>[0];

    it('merges server metadata without touching the version or the staged palette', () => {
        const withChart = explorerReducer(
            undefined,
            explorerActions.setSavedChart(savedChart),
        );
        const withStagedPalette = explorerReducer(
            withChart,
            explorerActions.setColorPaletteUuid('staged-palette'),
        );

        const result = explorerReducer(
            withStagedPalette,
            explorerActions.setSavedChartMetadata({
                ...savedChart,
                name: 'New name',
                description: 'New description',
                pinnedListUuid: 'pinned-list',
                colorPaletteUuid: 'server-palette',
                metricQuery: { metrics: ['orders_total'] },
            } as unknown as Parameters<
                typeof explorerActions.setSavedChartMetadata
            >[0]),
        );

        expect(result.savedChart?.name).toBe('New name');
        expect(result.savedChart?.description).toBe('New description');
        expect(result.savedChart?.pinnedListUuid).toBe('pinned-list');
        expect(result.savedChart?.metricQuery).toEqual({
            metrics: ['orders_count'],
        });
        expect(result.savedChart?.colorPaletteUuid).toBe('saved-palette');
        expect(result.unsavedColorPaletteUuid).toBe('staged-palette');
    });

    it('ignores metadata for a session with no saved chart', () => {
        const result = explorerReducer(
            undefined,
            explorerActions.setSavedChartMetadata(savedChart),
        );

        expect(result.savedChart).toBeUndefined();
    });
});

describe('explorerSlice custom chart query shape', () => {
    const customConfig = {
        type: ChartType.DATA_APP_VIZ as const,
        config: {
            dataAppVizUuid: 'stream-graph',
            fieldMapping: {
                time: 'orders_month',
                value: 'orders_revenue',
                series: 'orders_status',
            },
            optionValues: {},
        },
    };
    const ready = () =>
        [
            explorerActions.setDimensions([
                'orders_month',
                'orders_status',
                'orders_region',
            ]),
            explorerActions.setMetrics(['orders_revenue', 'orders_count']),
            explorerActions.setChartConfig({ chartConfig: customConfig }),
            explorerActions.setPivotConfig({ columns: ['orders_status'] }),
            explorerActions.clearPendingFetch(),
        ].reduce(explorerReducer, defaultState);

    it('requests unpivoted results when leaving a custom chart', () => {
        const result = explorerReducer(
            ready(),
            explorerActions.setChartType({ chartType: ChartType.CARTESIAN }),
        );
        expect(result.unsavedChartVersion.pivotConfig).toBeUndefined();
        expect(result.queryExecution.pendingFetch).toBe(true);
    });

    it('requests results when mapping an already selected metric', () => {
        const result = explorerReducer(
            ready(),
            explorerActions.setChartConfig({
                chartConfig: {
                    ...customConfig,
                    config: {
                        ...customConfig.config,
                        fieldMapping: {
                            ...customConfig.config.fieldMapping,
                            value: 'orders_count',
                        },
                    },
                },
            }),
        );
        expect(result.queryExecution.pendingFetch).toBe(true);
    });

    it.each([
        explorerActions.setPivotConfig({ columns: ['orders_region'] }),
        explorerActions.setPivotColumns(['orders_region']),
        explorerActions.setPivotRows(['orders_month']),
    ])('requests results when pivot axes change: $type', (action) => {
        expect(
            explorerReducer(ready(), action).queryExecution.pendingFetch,
        ).toBe(true);
    });

    it('does not request results for presentation options or unchanged bindings', () => {
        const result = explorerReducer(
            ready(),
            explorerActions.setChartConfig({
                chartConfig: {
                    ...customConfig,
                    config: {
                        ...customConfig.config,
                        fieldMapping: { ...customConfig.config.fieldMapping },
                        optionValues: { showLegend: false },
                    },
                },
            }),
        );
        expect(result.queryExecution.pendingFetch).toBe(false);
        expect(
            explorerReducer(
                result,
                explorerActions.setPivotColumns(['orders_status']),
            ).queryExecution.pendingFetch,
        ).toBe(false);
    });

    it('refreshes the previous result shape when canceling Chart Studio', () => {
        const result = [
            explorerActions.startChartTypeAuthoring({
                dataAppVizUuid: 'stream-graph',
            }),
            explorerActions.setPivotColumns(['orders_region']),
            explorerActions.clearPendingFetch(),
            explorerActions.cancelChartTypeAuthoring(),
        ].reduce(explorerReducer, ready());
        expect(result.unsavedChartVersion.pivotConfig).toEqual({
            columns: ['orders_status'],
        });
        expect(result.queryExecution.pendingFetch).toBe(true);
    });
});
