import {
    type PivotChartData,
    type SemanticLayerPivot,
    type VizSqlCartesianChartLayout,
} from '@lightdash/common';
import { ResultsTransformer } from '../../../components/DataViz/transformers/ResultsTransformer';

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
    async getPivotChartData(
        config: VizSqlCartesianChartLayout,
    ): Promise<PivotChartData> {
        const pivotConfig = transformChartLayoutToSemanticPivot(config);

        console.log(pivotConfig);

        throw new Error('Not implemented');
    }
}
