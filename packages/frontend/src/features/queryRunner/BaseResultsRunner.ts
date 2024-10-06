import {
    assertUnreachable,
    DimensionType,
    FieldType,
    SemanticLayerFieldType,
    VizAggregationOptions,
    VizIndexType,
    VIZ_DEFAULT_AGGREGATION,
    type IResultsRunner,
    type PivotChartData,
    type RawResultRow,
    type RunPivotQuery,
    type SemanticLayerField,
    type SemanticLayerQuery,
    type VizCustomMetricLayoutOptions,
    type VizIndexLayoutOptions,
    type VizValuesLayoutOptions,
} from '@lightdash/common';
import { QueryClient } from '@tanstack/react-query';

export function getDimensionTypeFromSemanticLayerFieldType(
    type: SemanticLayerFieldType,
): DimensionType {
    switch (type) {
        case SemanticLayerFieldType.TIME:
            return DimensionType.TIMESTAMP;
        case SemanticLayerFieldType.STRING:
            return DimensionType.STRING;
        case SemanticLayerFieldType.NUMBER:
            return DimensionType.NUMBER;
        case SemanticLayerFieldType.BOOLEAN:
            return DimensionType.BOOLEAN;
        default:
            return assertUnreachable(type, `Unknown field type: ${type}`);
    }
}

// Useful but belongs on chart model
export const getVizIndexTypeFromSemanticLayerFieldType = (
    type: SemanticLayerFieldType,
): VizIndexType => {
    switch (type) {
        case SemanticLayerFieldType.BOOLEAN:
        case SemanticLayerFieldType.NUMBER:
        case SemanticLayerFieldType.STRING:
            return VizIndexType.CATEGORY;
        case SemanticLayerFieldType.TIME:
            return VizIndexType.TIME;
        default:
            return assertUnreachable(type, `Unknown field type: ${type}`);
    }
};

export class BaseResultsRunner implements IResultsRunner {
    private readonly availableFields: SemanticLayerField[];

    private readonly rows: RawResultRow[];

    private readonly dimensions: SemanticLayerField[];

    private readonly metrics: SemanticLayerField[];

    // NOTE: putting the query client on the Base means that
    // this is essentially a frontend only class. The backend would need it's own base.
    private readonly queryClient: QueryClient;

    private readonly runPivotQuery: RunPivotQuery;

    constructor({
        fields,
        rows,
        columnNames,
        runPivotQuery,
    }: {
        rows: RawResultRow[];
        columnNames: string[];
        fields: SemanticLayerField[];
        runPivotQuery: RunPivotQuery;
    }) {
        this.runPivotQuery = runPivotQuery;

        this.rows = rows;

        this.availableFields = fields.filter((f) =>
            columnNames.includes(f.name),
        );

        this.dimensions = this.availableFields.filter(
            (field) => field.kind === FieldType.DIMENSION,
        );
        this.metrics = this.availableFields.filter(
            (field) => field.kind === FieldType.METRIC,
        );

        this.queryClient = new QueryClient();
    }

    async getPivotedVisualizationData(
        query: SemanticLayerQuery,
    ): Promise<PivotChartData> {
        const emptyPivotChartData: PivotChartData = {
            fileUrl: undefined,
            results: [],
            indexColumn: undefined,
            valuesColumns: [],
            columns: [],
        };

        if (!query) {
            return emptyPivotChartData;
        }

        return this.queryClient.fetchQuery({
            queryKey: ['transformedData', query],
            queryFn: () => this.runPivotQuery(query),
        });
    }

    getPivotQueryDimensions(): VizIndexLayoutOptions[] {
        // the same as pivotChartIndexLayoutOptions
        return this.dimensions.map((dimension) => ({
            reference: dimension.name,
            axisType: getVizIndexTypeFromSemanticLayerFieldType(dimension.type),
            dimensionType: getDimensionTypeFromSemanticLayerFieldType(
                dimension.type,
            ),
        }));
    }

    getPivotQueryMetrics(): VizValuesLayoutOptions[] {
        // returns empty for sql runner because there's no metrics
        return this.metrics.map((metric) => ({
            reference: metric.name,
            aggregation: metric.aggType || VIZ_DEFAULT_AGGREGATION,
        }));
    }

    getPivotQueryCustomMetrics(): VizCustomMetricLayoutOptions[] {
        // this will return custom metrics for both runners but we don't have to use them on semantic viewer
        return this.availableFields.reduce<VizCustomMetricLayoutOptions[]>(
            (acc, field) => {
                if (field.kind === FieldType.METRIC) {
                    return acc;
                }
                // TODO: can be greatly simplified
                switch (field.type) {
                    case SemanticLayerFieldType.BOOLEAN:
                    case SemanticLayerFieldType.STRING:
                        return [
                            ...acc,
                            {
                                reference: field.name,
                                aggregationOptions: [
                                    VizAggregationOptions.ANY,
                                    VizAggregationOptions.COUNT,
                                ],
                                dimensionType:
                                    getDimensionTypeFromSemanticLayerFieldType(
                                        field.type,
                                    ),
                                axisType: VizIndexType.CATEGORY,
                                aggregation: VizAggregationOptions.AVERAGE, // WHY IS THIS NEEDED
                            },
                        ];
                    case SemanticLayerFieldType.NUMBER:
                        return [
                            ...acc,
                            {
                                reference: field.name,
                                aggregationOptions: [
                                    VizAggregationOptions.AVERAGE,
                                    VizAggregationOptions.SUM,
                                    VizAggregationOptions.MIN,
                                    VizAggregationOptions.MAX,
                                    VizAggregationOptions.ANY,
                                    VizAggregationOptions.COUNT,
                                ],
                                dimensionType:
                                    getDimensionTypeFromSemanticLayerFieldType(
                                        field.type,
                                    ),
                                axisType: VizIndexType.CATEGORY,
                                aggregation: VizAggregationOptions.AVERAGE, // WHY IS THIS NEEDED
                            },
                        ];
                    case SemanticLayerFieldType.TIME:
                        return acc;
                    default:
                        return assertUnreachable(
                            field.type,
                            `Unknown field type: ${field.type}`,
                        );
                }
            },
            [],
        );
    }

    // used by the table viz only
    getColumnNames(): string[] {
        if (!this.rows.length) {
            return [];
        }
        return Object.keys(this.rows[0]);
    }

    // TODO: Powers the table visualization - move this out the runner
    getRows() {
        return this.rows;
    }
}
