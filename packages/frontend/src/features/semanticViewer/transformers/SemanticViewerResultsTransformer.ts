import {
    type PivotChartData,
    type ResultRow,
    type RowData,
    type SemanticLayerPivot,
    type SemanticLayerQuery,
    type VizSqlCartesianChartLayout,
    type VizSqlColumn,
} from '@lightdash/common';
import { ResultsTransformer } from '../../../components/DataViz/transformers/ResultsTransformer';
import { apiPostSemanticLayerRun } from '../api/requests';

const transformChartLayoutToSemanticPivot = (
    config: VizSqlCartesianChartLayout,
): SemanticLayerPivot => {
    return {
        on: config.groupBy?.map((groupBy) => groupBy.reference) ?? [],
        index: [config.x.reference],
        values: config.y.map((y) => ({
            name: y.reference,
            aggFunction: y.aggregation,
        })),
    };
};

export class SemanticViewerResultsTransformer extends ResultsTransformer {
    private readonly query: SemanticLayerQuery;

    private readonly projectUuid: string;

    constructor({
        query,
        projectUuid,
        ...args
    }: {
        query: SemanticLayerQuery;
        projectUuid: string;
        rows: (RowData | ResultRow)[];
        columns: VizSqlColumn[];
    }) {
        super(args);

        this.query = query;
        this.projectUuid = projectUuid;
    }

    async getPivotChartData(
        config: VizSqlCartesianChartLayout,
    ): Promise<PivotChartData> {
        const pivotConfig = transformChartLayoutToSemanticPivot(config);

        const pivotedResults = await apiPostSemanticLayerRun({
            projectUuid: this.projectUuid,
            query: {
                ...this.query,
                pivot: pivotConfig,
            },
        });

        console.log({
            pivotedResults,
        });

        throw new Error('Not implemented');
    }
}
