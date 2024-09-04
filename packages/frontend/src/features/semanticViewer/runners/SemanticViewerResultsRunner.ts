import {
    convertColumnToResultsColumn,
    convertToResultsColumns,
    type PivotChartData,
    type RawResultRow,
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

    constructor({
        query,
        projectUuid,
        ...args
    }: {
        query: SemanticLayerQuery;
        projectUuid: string;
        rows: RawResultRow[];
        columns: VizSqlColumn[];
    }) {
        super(args);

        this.query = query;
        this.projectUuid = projectUuid;
    }

    getColumnsAccessorFn(column: string) {
        return (row: RawResultRow) => {
            const rowKeys = Object.keys(row);

            // Result columns casing depends on warehouse, so we need to find the correct column name
            const rowKey = convertColumnToResultsColumn(column, rowKeys);

            if (!rowKey) {
                return;
            }

            return row[rowKey];
        };
    }

    async getPivotChartData(config: VizChartLayout): Promise<PivotChartData> {
        const pivotConfig = transformChartLayoutToSemanticPivot(config);
        const pivotedResults = await apiGetSemanticLayerQueryResults({
            projectUuid: this.projectUuid,
            query: {
                ...this.query,
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
        };
    }
}
