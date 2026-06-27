import { BinType, ChartType, CustomDimensionType } from '@lightdash/common';
import { createExplorerStore, explorerActions } from './index';

const CUSTOM_DIM_ID = 'my_table_my_custom_dim';

function makeStoreWithCustomDimension() {
    return createExplorerStore({
        explorer: {
            isVisualizationConfigOpen: false,
            isEditMode: true,
            isMinimal: false,
            parameterReferences: [],
            parameterDefinitions: {},
            previouslyFetchedState: undefined,
            cachedChartConfigs: {},
            expandedSections: [],
            unsavedChartVersion: {
                tableName: 'my_table',
                metricQuery: {
                    exploreName: 'my_table',
                    dimensions: [CUSTOM_DIM_ID, 'my_table_regular_dim'],
                    metrics: [],
                    filters: {},
                    sorts: [],
                    limit: 500,
                    tableCalculations: [],
                    additionalMetrics: [],
                    customDimensions: [
                        {
                            id: CUSTOM_DIM_ID,
                            name: 'my_custom_dim',
                            type: CustomDimensionType.BIN,
                            table: 'my_table',
                            dimensionId: 'my_table_some_field',
                            binType: BinType.FIXED_NUMBER,
                            binNumber: 5,
                        },
                    ],
                },
                pivotConfig: undefined,
                tableConfig: {
                    columnOrder: [CUSTOM_DIM_ID, 'my_table_regular_dim'],
                },
                chartConfig: {
                    type: ChartType.CARTESIAN,
                    config: undefined,
                },
            },
            modals: {
                format: { isOpen: false },
                additionalMetric: { isOpen: false },
                customDimension: { isOpen: false },
                writeBack: { isOpen: false },
                itemDetail: { isOpen: false },
                periodOverPeriodComparison: { isOpen: false },
            },
            unsavedColorPaletteUuid: null,
            queryExecution: {
                validQueryArgs: null,
                unpivotedQueryArgs: null,
                queryUuidHistory: [],
                unpivotedQueryUuidHistory: [],
                pendingFetch: false,
            },
            preAggregate: {
                usePreAggregateCache: true,
                check: { status: 'idle' },
            },
        },
    });
}

describe('explorerSlice — custom dimension removal', () => {
    it('removeField on a custom dimension deletes the definition (not used by column header)', () => {
        const store = makeStoreWithCustomDimension();
        store.dispatch(explorerActions.removeField(CUSTOM_DIM_ID));
        const { metricQuery } = store.getState().explorer.unsavedChartVersion;

        // removeField strips the definition — only used for table calculations / invalid items, not custom dimensions
        expect(metricQuery.customDimensions).toHaveLength(0);
        expect(metricQuery.dimensions).not.toContain(CUSTOM_DIM_ID);
    });

    it('toggleDimension on a custom dimension deselects it but preserves the definition (column header Remove behavior)', () => {
        const store = makeStoreWithCustomDimension();
        store.dispatch(explorerActions.toggleDimension(CUSTOM_DIM_ID));
        const { metricQuery } = store.getState().explorer.unsavedChartVersion;

        // toggleDimension should only affect dimensions[], not customDimensions[]
        expect(metricQuery.customDimensions).toHaveLength(1);
        expect(metricQuery.customDimensions?.[0].id).toBe(CUSTOM_DIM_ID);
        expect(metricQuery.dimensions).not.toContain(CUSTOM_DIM_ID);
    });

    it('removeCustomDimension removes the definition AND deselects', () => {
        const store = makeStoreWithCustomDimension();
        store.dispatch(explorerActions.removeCustomDimension(CUSTOM_DIM_ID));
        const { metricQuery } = store.getState().explorer.unsavedChartVersion;

        expect(metricQuery.customDimensions).toHaveLength(0);
        expect(metricQuery.dimensions).not.toContain(CUSTOM_DIM_ID);
    });
});
