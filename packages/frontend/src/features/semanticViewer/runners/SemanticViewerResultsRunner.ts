import {
    convertColumnToResultsColumn,
    convertToResultsColumns,
    type PivotChartData,
    type RawResultRow,
    type SemanticLayerColumnMapping,
    type SemanticLayerPivot,
    type SemanticLayerQuery,
    type VizChartLayout,
    type VizSqlColumn,
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

    private readonly columnMappings: SemanticLayerColumnMapping[];

    constructor({
        query,
        projectUuid,
        columnMappings,
        ...args
    }: {
        query: SemanticLayerQuery;
        projectUuid: string;
        columnMappings: SemanticLayerColumnMapping[];
        rows: RawResultRow[];
        columns: VizSqlColumn[];
    }) {
        super(args);

        this.query = query;
        this.projectUuid = projectUuid;
        this.columnMappings = columnMappings;
    }

    getColumnsAccessorFn(column: string) {
        return (row: RawResultRow) => {
            const resultsColumns = Object.keys(row);
            const columnMapping = this.columnMappings.find(
                (mapping) => mapping.fieldName === column,
            )?.columnName;

            if (!columnMapping) {
                return;
            }

            // Result columns casing depends on warehouse, so we need to find the correct column name
            const mappedColumn = convertColumnToResultsColumn(
                columnMapping,
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

        const mappedX = this.columnMappings.find(
            (mapping) => mapping.fieldName === config.x?.reference,
        )?.columnName;

        if (mappedX && config.x?.type) {
            const xReference = convertColumnToResultsColumn(
                mappedX,
                allResultsColumns,
            );

            indexColumn = xReference
                ? {
                      ...config.x,
                      reference: xReference,
                  }
                : undefined;
        }

        const columnsToRemove = [...pivotConfig.index, ...pivotConfig.on]
            .map(
                (column) =>
                    this.columnMappings.find(
                        (mapping) => mapping.fieldName === column,
                    )?.columnName,
            )
            .filter((c): c is string => !!c);

        const resultsColumnsToRemove = convertToResultsColumns(
            columnsToRemove,
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
