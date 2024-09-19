import {
    assertUnreachable,
    DimensionType,
    FieldType,
    SemanticLayerFieldType,
    VizIndexType,
    VIZ_DEFAULT_AGGREGATION,
    type IResultsRunner,
    type PivotChartData,
    type RawResultRow,
    type SemanticLayerField,
    type SemanticLayerPivot,
    type SemanticLayerQuery,
    type SemanticViewerPivotChartLayout,
    type SqlRunnerPivotChartLayout,
    type VizColumn,
    type VizCustomMetricLayoutOptions,
    type VizIndexLayoutOptions,
    type VizValuesLayoutOptions,
} from '@lightdash/common';
import { apiGetSemanticLayerQueryResults } from '../api/requests';

const transformChartLayoutToSemanticPivot = (
    config: SemanticViewerPivotChartLayout,
): SemanticLayerPivot => {
    if (!config.x) {
        throw new Error('X is required');
    }

    return {
        on: [config.x.reference],
        index: config.groupBy?.map((groupBy) => groupBy.reference) ?? [],
        values: config.y.map((y) => y.reference),
    };
};

function getDimensionTypeFromSemanticLayerFieldType(
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

function getVizIndexTypeFromDimensionType(
    type: SemanticLayerFieldType,
): VizIndexType {
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
}

export class SemanticViewerResultsRunner implements IResultsRunner {
    private readonly query: SemanticLayerQuery;

    private readonly projectUuid: string;

    private readonly fields: SemanticLayerField[];

    private readonly availableFields: SemanticLayerField[];

    private readonly rows: RawResultRow[];

    private readonly dimensions: SemanticLayerField[];

    private readonly metrics: SemanticLayerField[];

    constructor({
        query,
        projectUuid,
        fields,
        rows,
        columnNames,
    }: {
        query: SemanticLayerQuery;
        projectUuid: string;
        rows: RawResultRow[];
        columnNames: string[];
        fields: SemanticLayerField[];
    }) {
        this.query = query;
        this.projectUuid = projectUuid;
        this.fields = fields;

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
    }

    getDimensions(): VizIndexLayoutOptions[] {
        return this.dimensions.map((dimension) => ({
            reference: dimension.name,
            axisType: getVizIndexTypeFromDimensionType(dimension.type),
            dimensionType: getDimensionTypeFromSemanticLayerFieldType(
                dimension.type,
            ),
        }));
    }

    getMetrics(): VizValuesLayoutOptions[] {
        return this.metrics.map((metric) => ({
            reference: metric.name,
            aggregation: metric.aggType || VIZ_DEFAULT_AGGREGATION,
        }));
    }

    getPivotQueryDimensions(): VizIndexLayoutOptions[] {
        return this.dimensions.map((dimension) => ({
            reference: dimension.name,
            axisType: getVizIndexTypeFromDimensionType(dimension.type),
            dimensionType: getDimensionTypeFromSemanticLayerFieldType(
                dimension.type,
            ),
        }));
    }

    getPivotQueryMetrics(): VizValuesLayoutOptions[] {
        return this.metrics.map((metric) => ({
            reference: metric.name,
            aggregation: metric.aggType || VIZ_DEFAULT_AGGREGATION,
            aggregationOptions: [],
        }));
    }

    getPivotQueryCustomMetrics(): VizCustomMetricLayoutOptions[] {
        // No custom metrics for semantic layer yet
        return [];
    }

    static convertColumnNamesToVizColumns(
        fields: SemanticLayerField[],
        columnNames: string[],
    ): VizColumn[] {
        return columnNames
            .map<VizColumn | undefined>((columnName) => {
                const field = fields.find((f) => f.name === columnName);
                if (!field) {
                    return;
                }

                const dimType = getDimensionTypeFromSemanticLayerFieldType(
                    field.type,
                );

                return {
                    reference: columnName,
                    type: dimType,
                };
            })
            .filter((c): c is VizColumn => Boolean(c));
    }

    async getPivotedVisualizationData(
        config: SqlRunnerPivotChartLayout,
    ): Promise<PivotChartData> {
        if (config.x === undefined || config.y.length === 0) {
            return {
                fileUrl: undefined,
                results: [],
                indexColumn: undefined,
                valuesColumns: [],
                columns: [],
            };
        }

        const pivotConfig = transformChartLayoutToSemanticPivot(config);
        const pivotedResults = await apiGetSemanticLayerQueryResults({
            projectUuid: this.projectUuid,
            query: {
                ...this.query,
                pivot: pivotConfig,
            },
        });

        const { results, columns } = pivotedResults;

        // The backend call has no knowledge of field types, so we need to map them to the correct types
        const vizColumns: VizColumn[] =
            SemanticViewerResultsRunner.convertColumnNamesToVizColumns(
                this.fields,
                columns,
            );

        // The index column is the first column in the pivot config
        const onField = this.fields.find((f) => f.name === pivotConfig.on[0]);

        const indexColumn = onField
            ? {
                  reference: onField.name,
                  type: getVizIndexTypeFromDimensionType(onField.type),
              }
            : undefined;

        const valuesColumns = pivotedResults.columns.filter(
            (col) => !pivotConfig.on.includes(col),
        );

        return {
            fileUrl: undefined,
            results,
            indexColumn,
            valuesColumns,
            columns: vizColumns,
        };
    }

    getColumns(): string[] {
        return this.availableFields.map((field) => field.name);
    }

    getColumnsAccessorFn(column: string) {
        return (row: RawResultRow) => row[column];
    }

    getRows() {
        return this.rows;
    }
}
