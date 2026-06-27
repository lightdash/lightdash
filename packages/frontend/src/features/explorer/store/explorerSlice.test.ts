import { CustomDimensionType } from '@lightdash/common';
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
                            dimensionType: CustomDimensionType.BIN,
                            table: 'my_table',
                            binType: 'fixed_count',
                            binCount: 5,
                        },
                    ],
                },
                pivotConfig: undefined,
                tableConfig: {
                    columnOrder: [CUSTOM_DIM_ID, 'my_table_regular_dim'],
                },
                chartConfig: {
                    type: 'cartesian' as const,
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
    it('removeField on a custom dimension id deletes the custom dimension definition (current broken behavior)', () => {
        const store = makeStoreWithCustomDimension();
        store.dispatch(explorerActions.removeField(CUSTOM_DIM_ID));
        const { metricQuery } = store.getState().explorer.unsavedChartVersion;

        // removeField strips the definition — this is the BUG
        expect(metricQuery.customDimensions).toHaveLength(0);
        expect(metricQuery.dimensions).not.toContain(CUSTOM_DIM_ID);
    });

    it('toggleDimension on a custom dimension id deselects it but preserves the definition', () => {
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
