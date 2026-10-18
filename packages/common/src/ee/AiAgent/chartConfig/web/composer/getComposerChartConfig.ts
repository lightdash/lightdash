import { type ItemsMap } from '../../../../../types/field';
import { type MetricQuery } from '../../../../../types/metricQuery';
import { type ChartConfig } from '../../../../../types/savedCharts';
import {
    COMPOSER_TABLE_INTENT,
    type AiComposerChartViz,
} from '../../../composerArtifact';
import { getRunQueryChartConfig } from '../runQueryTool/getRunQueryChartConfig';
import { type AiAgentChartTypeOption } from '../types';

/**
 * The explorer config a composer artifact's result is drawn with: an edited
 * config as it is, otherwise the agent's intent built the way a runQuery
 * answer is, over the items synthesized from the result columns. A chart
 * type override (the viz switcher) always rebuilds from the intent.
 */
export const getComposerChartConfig = ({
    viz,
    metricQuery,
    fieldsMap,
    metadata,
    overrideChartType,
}: {
    viz: AiComposerChartViz;
    metricQuery: MetricQuery;
    fieldsMap: ItemsMap;
    metadata: { title: string | null; description: string | null };
    overrideChartType?: AiAgentChartTypeOption;
}): ChartConfig => {
    if (!overrideChartType && viz.chartConfig) return viz.chartConfig;
    const intent = viz.intent ?? COMPOSER_TABLE_INTENT;
    return getRunQueryChartConfig({
        queryTool: {
            title: metadata.title ?? '',
            description: metadata.description ?? '',
            queryConfig: metricQuery,
            chartConfig: intent,
        },
        metricQuery,
        fieldsMap,
        overrideChartType,
    });
};

/** The chart type the viz opens on: the intent's, or the edited config's kind when there is no intent. */
export const getComposerDefaultChartType = (
    viz: AiComposerChartViz,
): AiAgentChartTypeOption | null =>
    viz.intent?.defaultVizType ?? (viz.chartConfig ? null : 'table');

/** The pivot dimensions the viz implies: the edited config's, else the intent's series split. */
export const getComposerPivotDimensions = (
    viz: AiComposerChartViz,
    overrideChartType?: AiAgentChartTypeOption,
): string[] | undefined => {
    if (!overrideChartType && viz.chartConfig)
        return viz.pivotConfig?.columns ?? undefined;
    const groupBy = viz.intent?.groupBy ?? null;
    return groupBy && groupBy.length > 0 ? groupBy : undefined;
};
