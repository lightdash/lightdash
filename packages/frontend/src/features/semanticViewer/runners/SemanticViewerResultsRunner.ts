import {
    assertUnreachable,
    DimensionType,
    FieldType,
    SemanticLayerFieldType,
    SemanticLayerSortByDirection,
    SortByDirection,
    VizIndexType,
    type PivotChartData,
    type RawResultRow,
    type SemanticLayerField,
    type SemanticLayerPivot,
    type SemanticLayerQuery,
    type VizChartLayout,
    type VizColumn,
    type VizIndexLayoutOptions,
    type VizPivotLayoutOptions,
    type VizTableHeaderSortConfig,
    type VizValuesLayoutOptions,
} from '@lightdash/common';
import { ResultsRunner } from '../../../components/DataViz/transformers/ResultsRunner';
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

export class SemanticViewerResultsRunner extends ResultsRunner {
    private readonly query: SemanticLayerQuery;

    private readonly projectUuid: string;

    private readonly fields: SemanticLayerField[];

    constructor({
        query,
        projectUuid,
        fields,
        ...args
    }: {
        query: SemanticLayerQuery;
        projectUuid: string;
        rows: RawResultRow[];
        columns: VizColumn[];
        fields: SemanticLayerField[];
    }) {
        super(args);

        this.query = query;
        this.projectUuid = projectUuid;
        this.fields = fields;
    }

    pivotChartOptions(): {
        indexLayoutOptions: VizIndexLayoutOptions[];
        valuesLayoutOptions: VizValuesLayoutOptions[];
        pivotLayoutOptions: VizPivotLayoutOptions[];
    } {
        return {
            indexLayoutOptions: this.columns.reduce((acc, column) => {
                const field =
                    SemanticViewerResultsRunner.findSemanticLayerFieldFromColumn(
                        this.fields,
                        column.reference,
                    );
                if (field?.kind === FieldType.DIMENSION) {
                    acc.push({
                        reference: column.reference,
                        type: this.getAxisType(column),
                    });
                }
                return acc;
            }, [] as VizIndexLayoutOptions[]),
            valuesLayoutOptions: this.columns.reduce((acc, column) => {
                const field =
                    SemanticViewerResultsRunner.findSemanticLayerFieldFromColumn(
                        this.fields,
                        column.reference,
                    );
                if (field?.kind === FieldType.METRIC) {
                    acc.push({
                        reference: column.reference,
                    });
                }
                return acc;
            }, [] as VizValuesLayoutOptions[]),
            pivotLayoutOptions: this.columns.filter((column) => {
                const field =
                    SemanticViewerResultsRunner.findSemanticLayerFieldFromColumn(
                        this.fields,
                        column.reference,
                    );
                return field?.kind === FieldType.DIMENSION;
            }),
        };
    }

    defaultPivotChartLayout(): VizChartLayout | undefined {
        const xColumn = this.columns.find((column) => {
            const field =
                SemanticViewerResultsRunner.findSemanticLayerFieldFromColumn(
                    this.fields,
                    column.reference,
                );
            return field?.kind === FieldType.DIMENSION;
        });

        const yColumn = this.columns.find((column) => {
            const field =
                SemanticViewerResultsRunner.findSemanticLayerFieldFromColumn(
                    this.fields,
                    column.reference,
                );
            return field?.kind === FieldType.METRIC;
        });
        if (!xColumn || !yColumn) {
            return;
        }

        return {
            x: {
                reference: xColumn.reference,
                type: this.getAxisType(xColumn),
            },
            y: [
                {
                    reference: yColumn.reference,
                },
            ],
            groupBy: [],
        };
    }

    static convertColumnsToVizColumns(
        fields: SemanticLayerField[],
        columns: string[],
    ): VizColumn[] {
        return columns.map<VizColumn>((column) => {
            const field =
                SemanticViewerResultsRunner.findSemanticLayerFieldFromColumn(
                    fields,
                    column,
                );

            const dimType = getDimensionTypeFromSemanticLayerFieldType(
                field?.type ?? SemanticLayerFieldType.STRING,
            );

            return {
                reference: column,
                type: dimType,
            };
        });
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
                fileUrl: undefined,
                results: [],
                indexColumn: undefined,
                valuesColumns: [],
                columns: [],
            };
        }

        const pivotConfig = transformChartLayoutToSemanticPivot(config);

        // ! When there is pivotConfig.index (group by) then we cannot sort by anything other than pivotConfig.on (X field) -> this is because the results don't include those columns
        const pivotSorts =
            pivotConfig.index.length > 0
                ? this.query.sortBy.filter((s) =>
                      pivotConfig.on.includes(s.name),
                  )
                : this.query.sortBy;

        const pivotedResults = await apiGetSemanticLayerQueryResults({
            projectUuid: this.projectUuid,
            query: {
                ...this.query,
                sortBy: pivotSorts,
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
            fileUrl: undefined,
            results,
            indexColumn,
            valuesColumns,
            columns: vizColumns,
        };
    }

    private transformSemanticLayerSort(
        sortDirection?: SemanticLayerSortByDirection,
    ) {
        if (!sortDirection) {
            return;
        }

        switch (sortDirection) {
            case SemanticLayerSortByDirection.ASC:
                return SortByDirection.ASC;
            case SemanticLayerSortByDirection.DESC:
                return SortByDirection.DESC;
            default:
                return assertUnreachable(
                    sortDirection,
                    `Unknown sort direction: ${sortDirection}`,
                );
        }
    }

    getTableHeaderSortConfig(): VizTableHeaderSortConfig {
        return this.columns.reduce<VizTableHeaderSortConfig>((acc, col) => {
            const sortBy = this.query.sortBy.find(
                (sort) => sort.name === col.reference,
            );

            return {
                ...acc,
                [col.reference]: {
                    direction: this.transformSemanticLayerSort(
                        sortBy?.direction,
                    ),
                },
            };
        }, {});
    }
}
