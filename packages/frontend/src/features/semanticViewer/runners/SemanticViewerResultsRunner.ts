import {
    assertUnreachable,
    DimensionType,
    FieldType,
    SemanticLayerFieldType,
    VizIndexType,
    type IResultsRunner,
    type PivotChartData,
    type RawResultRow,
    type SemanticLayerField,
    type SemanticLayerPivot,
    type SemanticLayerQuery,
    type VizChartLayout,
    type VizColumn,
    type VizIndexLayoutOptions,
    type VizPivotLayoutOptions,
    type VizValuesLayoutOptions,
} from '@lightdash/common';
import { intersectionBy } from 'lodash';
import { apiGetSemanticLayerQueryResults } from '../api/requests';

const transformChartLayoutToSemanticPivot = (
    config: VizChartLayout,
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

export class SemanticViewerResultsRunner
    implements IResultsRunner<VizChartLayout>
{
    private readonly query: SemanticLayerQuery;

    private readonly projectUuid: string;

    private readonly fields: SemanticLayerField[];

    private readonly rows: RawResultRow[];

    private readonly columns: VizColumn[];

    private readonly dimensions: SemanticLayerField[];

    private readonly metrics: SemanticLayerField[];

    constructor({
        query,
        projectUuid,
        fields,
        rows,
        columns,
    }: {
        query: SemanticLayerQuery;
        projectUuid: string;
        rows: RawResultRow[];
        columns: VizColumn[];
        fields: SemanticLayerField[];
    }) {
        this.query = query;
        this.projectUuid = projectUuid;
        this.fields = fields;
        this.dimensions = fields.filter(
            (field) => field.kind === FieldType.DIMENSION,
        );
        this.metrics = fields.filter(
            (field) => field.kind === FieldType.METRIC,
        );

        this.rows = rows;

        this.columns = columns;
    }

    pivotChartOptions(): {
        indexLayoutOptions: VizIndexLayoutOptions[];
        valuesLayoutOptions: VizValuesLayoutOptions[];
        pivotLayoutOptions: VizPivotLayoutOptions[];
    } {
        return {
            indexLayoutOptions: this.dimensions.map((dimension) => ({
                reference: dimension.name,
                type: getVizIndexTypeFromDimensionType(dimension.type),
            })),
            valuesLayoutOptions: this.metrics.map((metric) => ({
                reference: metric.name,
            })),
            pivotLayoutOptions: this.dimensions.map((dimension) => ({
                reference: dimension.name,
                type: getVizIndexTypeFromDimensionType(dimension.type),
            })),
        };
    }

    defaultPivotChartLayout(): VizChartLayout | undefined {
        const xColumn = this.dimensions[0];
        const yColumn = this.metrics[0];

        if (!xColumn || !yColumn) {
            return;
        }

        return {
            x: {
                reference: xColumn.name,
                type: getVizIndexTypeFromDimensionType(xColumn.type),
            },
            y: [
                {
                    reference: yColumn.name,
                },
            ],
            groupBy: [],
        };
    }

    static convertColumnsToVizColumns(
        fields: SemanticLayerField[],
        columns: string[],
    ): VizColumn[] {
        return columns
            .map<VizColumn | undefined>((column) => {
                const field =
                    SemanticViewerResultsRunner.findSemanticLayerFieldFromColumn(
                        fields,
                        column,
                    );
                if (!field) {
                    return;
                }

                const dimType = getDimensionTypeFromSemanticLayerFieldType(
                    field.type,
                );

                return {
                    reference: column,
                    type: dimType,
                };
            })
            .filter((c): c is VizColumn => Boolean(c));
    }

    private static findSemanticLayerFieldFromColumn(
        fields: SemanticLayerField[],
        column?: string,
    ) {
        return column
            ? fields.find((field) => field.name === column)
            : undefined;
    }

    async getPivotedVisualizationData(
        config: VizChartLayout,
    ): Promise<PivotChartData> {
        if (config.x === undefined || config.y.length === 0) {
            return {
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
            SemanticViewerResultsRunner.convertColumnsToVizColumns(
                this.fields,
                columns,
            );

        // The index column is the first column in the pivot config
        const onField =
            SemanticViewerResultsRunner.findSemanticLayerFieldFromColumn(
                this.fields,
                pivotConfig.on[0],
            );
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
            results,
            indexColumn,
            valuesColumns,
            columns: vizColumns,
        };
    }

    mergePivotChartLayout(currentConfig?: VizChartLayout) {
        const newDefaultLayout = this.defaultPivotChartLayout();

        const someFieldsMatch =
            currentConfig?.x?.reference === newDefaultLayout?.x?.reference ||
            intersectionBy(
                currentConfig?.y || [],
                newDefaultLayout?.y || [],
                'reference',
            ).length > 0;

        let mergedLayout = currentConfig;

        if (!currentConfig || !someFieldsMatch) {
            mergedLayout = newDefaultLayout;
        }

        return mergedLayout;
    }

    getColumns(): string[] {
        return this.fields.map((field) => field.name);
    }

    getColumnsAccessorFn(column: string) {
        return (row: RawResultRow) => row[column];
    }

    getRows() {
        return this.rows;
    }
}
