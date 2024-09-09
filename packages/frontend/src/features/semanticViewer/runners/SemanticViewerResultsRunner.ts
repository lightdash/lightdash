import {
    type PivotChartData,
    type RawResultRow,
    type SemanticLayerPivot,
    type SemanticLayerQuery,
    type VizChartLayout,
    type VizSqlColumn,
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
        on: config.x,
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

        // Filter dimensions, time dimensions, and metrics to match pivot config
        // This ensures correct aggregation for non-aggregated backend pivots (e.g., pie charts)
        // TODO: this should be moved to the backend
        const pivotedResults = await apiGetSemanticLayerQueryResults({
            projectUuid: this.projectUuid,
            query: {
                ...this.query,
                pivot: pivotConfig,
            },
        });

        return pivotedResults;
    }
}
