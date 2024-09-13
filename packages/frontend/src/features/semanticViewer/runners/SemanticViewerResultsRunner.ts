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
    type SemanticViewerPivotChartLayout,
    type VizColumn,
    type VizIndexLayoutOptions,
    type VizPivotLayoutOptions,
    type VizValuesLayoutOptions,
} from '@lightdash/common';
import { intersectionBy } from 'lodash';
import { type SqlRunnerPivotChartLayout } from '../../sqlRunner/runners/SqlRunnerResultsRunner';
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

export class SemanticViewerResultsRunner
    implements IResultsRunner<SqlRunnerPivotChartLayout>
{
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

    defaultPivotChartLayout(): SemanticViewerPivotChartLayout | undefined {
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
            results,
            indexColumn,
            valuesColumns,
            columns: vizColumns,
        };
    }

    mergePivotChartLayout(currentConfig?: SqlRunnerPivotChartLayout) {
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
        return this.availableFields.map((field) => field.name);
    }

    getColumnsAccessorFn(column: string) {
        return (row: RawResultRow) => row[column];
    }

    getRows() {
        return this.rows;
    }
}
