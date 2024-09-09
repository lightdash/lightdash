import {
    convertColumnToResultsColumn,
    convertToResultsColumns,
    FieldType,
    isSemanticLayerColumnArray,
    type PivotChartData,
    type RawResultRow,
    type SemanticLayerColumn,
    type SemanticLayerPivot,
    type SemanticLayerQuery,
    type VizChartLayout,
    type VizIndexLayoutOptions,
    type VizPivotLayoutOptions,
    type VizValuesLayoutOptions,
} from '@lightdash/common';
import { difference } from 'lodash';
import { ResultsRunner } from '../../../components/DataViz/transformers/ResultsRunner';
import { apiGetSemanticLayerQueryResults } from '../api/requests';

const transformChartLayoutToSemanticPivot = (
    config: VizChartLayout,
): SemanticLayerPivot => {
    return {
        on: config.x ? [config.x.reference] : [],
        index: config.groupBy?.map((groupBy) => groupBy.reference) ?? [],
        values: config.y.map((y) => y.reference),
    };
};

export class SemanticViewerResultsRunner extends ResultsRunner {
    private readonly query: SemanticLayerQuery;

    private readonly projectUuid: string;

    constructor({
        query,
        projectUuid,
        ...args
    }: {
        query: SemanticLayerQuery;
        projectUuid: string;
        rows: RawResultRow[];
        columns: SemanticLayerColumn[];
    }) {
        super(args);

        this.query = query;
        this.projectUuid = projectUuid;
    }

    pivotChartOptions(): {
        indexLayoutOptions: VizIndexLayoutOptions[];
        valuesLayoutOptions: VizValuesLayoutOptions[];
        pivotLayoutOptions: VizPivotLayoutOptions[];
    } {
        // TODO: these typechecks are unfortunate. We should use generics or clean up
        // the hierarchy so that we don't need them.
        if (!isSemanticLayerColumnArray(this.columns)) {
            return {
                indexLayoutOptions: [],
                valuesLayoutOptions: [],
                pivotLayoutOptions: [],
            };
        }
        return {
            indexLayoutOptions: this.columns.reduce((acc, column) => {
                if (column.kind === FieldType.DIMENSION) {
                    acc.push({
                        reference: column.reference,
                        type: this.getAxisType(column),
                    });
                }
                return acc;
            }, [] as VizIndexLayoutOptions[]),
            valuesLayoutOptions: this.columns.reduce((acc, column) => {
                if (column.kind === FieldType.METRIC) {
                    acc.push({
                        reference: column.reference,
                    });
                }
                return acc;
            }, [] as VizValuesLayoutOptions[]),
            pivotLayoutOptions: this.columns.filter(
                (column) => column.kind === FieldType.DIMENSION,
            ),
        };
    }

    defaultPivotChartLayout(): VizChartLayout | undefined {
        // TODO: a second unfortunate typecheck. See comment in pivotChartOptions.
        if (!isSemanticLayerColumnArray(this.columns)) {
            return undefined;
        }

        const xColumn = this.columns.find(
            (column) => column.kind === FieldType.DIMENSION,
        );

        const yColumn = this.columns.find(
            (column) => column.kind === FieldType.METRIC,
        );

        return {
            x: xColumn
                ? {
                      reference: xColumn.reference,
                      type: this.getAxisType(xColumn),
                  }
                : undefined,
            y: yColumn
                ? [
                      {
                          reference: yColumn.reference,
                      },
                  ]
                : [],
            groupBy: [],
        };
    }

    getColumnsAccessorFn(column: string) {
        return (row: RawResultRow) => {
            const resultsColumns = Object.keys(row);

            // Result columns casing depends on warehouse, so we need to find the correct column name
            const mappedColumn = convertColumnToResultsColumn(
                column,
                resultsColumns,
            );

            if (!mappedColumn) {
                return;
            }

            return row[mappedColumn];
        };
    }

    async getPivotedVisualizationData(
        config: VizChartLayout,
    ): Promise<PivotChartData> {
        const pivotConfig = transformChartLayoutToSemanticPivot(config);

        // Filter dimensions, time dimensions, and metrics to match pivot config
        // This ensures correct aggregation for non-aggregated backend pivots (e.g., pie charts)
        const pivotedResults = await apiGetSemanticLayerQueryResults({
            projectUuid: this.projectUuid,
            query: {
                ...this.query,
                dimensions: this.query.dimensions.filter(
                    (dimension) =>
                        pivotConfig.on.includes(dimension.name) ||
                        pivotConfig.index.includes(dimension.name),
                ),
                timeDimensions: this.query.timeDimensions.filter(
                    (timeDimension) =>
                        pivotConfig.on.includes(timeDimension.name) ||
                        pivotConfig.index.includes(timeDimension.name),
                ),
                metrics: this.query.metrics.filter((metric) =>
                    pivotConfig.values.includes(metric.name),
                ),
                // TODO: could this break sorting?
                sortBy: this.query.sortBy.filter(
                    (sortBy) =>
                        pivotConfig.on.includes(sortBy.name) ||
                        pivotConfig.index.includes(sortBy.name) ||
                        pivotConfig.values.includes(sortBy.name),
                ),
                pivot: pivotConfig,
            },
        });

        const allResultsColumns = Object.keys(pivotedResults?.[0] ?? {});
        let indexColumn: VizChartLayout['x'] | undefined;

        if (config.x) {
            const xReference = convertColumnToResultsColumn(
                config.x.reference,
                allResultsColumns,
            );

            indexColumn = xReference
                ? {
                      ...config.x,
                      reference: xReference,
                  }
                : undefined;
        }

        const columnsToRemove = convertToResultsColumns(
            [...pivotConfig.index, ...pivotConfig.on],
            allResultsColumns,
        );

        return {
            indexColumn,
            results: pivotedResults ?? [],
            valuesColumns: difference(allResultsColumns, columnsToRemove),
            columns: allResultsColumns.map((field) => ({
                reference: field,
            })),
        };
    }
}
