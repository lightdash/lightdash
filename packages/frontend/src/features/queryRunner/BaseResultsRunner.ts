import {
    DimensionType,
    FieldType,
    SqlRunnerFieldType,
    VIZ_DEFAULT_AGGREGATION,
    VizAggregationOptions,
    VizIndexType,
    assertUnreachable,
    type IResultsRunner,
    type PivotChartData,
    type RawResultRow,
    type RunPivotQuery,
    type SqlRunnerField,
    type SqlRunnerQuery,
    type VizCustomMetricLayoutOptions,
    type VizIndexLayoutOptions,
    type VizValuesLayoutOptions,
} from '@lightdash/common';
import { type QueryClient } from '@tanstack/react-query';
import { createQueryClient } from '../../providers/ReactQuery/createQueryClient';

// TODO: clean up types
function getDimensionTypeFromSqlRunnerFieldType(
    type: SqlRunnerFieldType,
): DimensionType {
    switch (type) {
        case SqlRunnerFieldType.TIME:
            return DimensionType.TIMESTAMP;
        case SqlRunnerFieldType.STRING:
            return DimensionType.STRING;
        case SqlRunnerFieldType.NUMBER:
            return DimensionType.NUMBER;
        case SqlRunnerFieldType.BOOLEAN:
            return DimensionType.BOOLEAN;
        default:
            return assertUnreachable(type, `Unknown field type: ${type}`);
    }
}

// Useful but belongs on chart model
export const getVizIndexTypeFromSqlRunnerFieldType = (
    type: SqlRunnerFieldType,
): VizIndexType => {
    switch (type) {
        case SqlRunnerFieldType.BOOLEAN:
        case SqlRunnerFieldType.NUMBER:
        case SqlRunnerFieldType.STRING:
            return VizIndexType.CATEGORY;
        case SqlRunnerFieldType.TIME:
            return VizIndexType.TIME;
        default:
            return assertUnreachable(type, `Unknown field type: ${type}`);
    }
};

export class BaseResultsRunner implements IResultsRunner {
    private readonly availableFields: SqlRunnerField[];

    private readonly rows: RawResultRow[];

    private readonly dimensions: SqlRunnerField[];

    private readonly metrics: SqlRunnerField[];

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
        fields: SqlRunnerField[];
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

        this.queryClient = createQueryClient();
    }

    async getPivotedVisualizationData(
        query: SqlRunnerQuery,
    ): Promise<PivotChartData> {
        const emptyPivotChartData: PivotChartData = {
            queryUuid: undefined,
            fileUrl: undefined,
            results: [],
            indexColumn: undefined,
            valuesColumns: [],
            columns: [],
            columnCount: undefined,
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
            axisType: getVizIndexTypeFromSqlRunnerFieldType(dimension.type),
            dimensionType: getDimensionTypeFromSqlRunnerFieldType(
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
        // this will return custom metrics
        return this.availableFields.reduce<VizCustomMetricLayoutOptions[]>(
            (acc, field) => {
                if (field.kind === FieldType.METRIC) {
                    return acc;
                }
                // TODO: can be greatly simplified
                switch (field.type) {
                    case SqlRunnerFieldType.BOOLEAN:
                    case SqlRunnerFieldType.STRING:
                        return [
                            ...acc,
                            {
                                reference: field.name,
                                aggregationOptions: [
                                    VizAggregationOptions.ANY,
                                    VizAggregationOptions.COUNT,
                                ],
                                dimensionType:
                                    getDimensionTypeFromSqlRunnerFieldType(
                                        field.type,
                                    ),
                                axisType: VizIndexType.CATEGORY,
                                aggregation: VizAggregationOptions.AVERAGE, // WHY IS THIS NEEDED
                            },
                        ];
                    case SqlRunnerFieldType.NUMBER:
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
                                    getDimensionTypeFromSqlRunnerFieldType(
                                        field.type,
                                    ),
                                axisType: VizIndexType.CATEGORY,
                                aggregation: VizAggregationOptions.AVERAGE, // WHY IS THIS NEEDED
                            },
                        ];
                    case SqlRunnerFieldType.TIME:
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
