import {
    COMPOSER_RESULT_TABLE_NAME,
    getComposerRunQueryBuilderInput,
    toComposerResultRows,
    type ComposerRunQueryBuilderVizType,
} from '../../composer/composerChartVizConfig';
import {
    type ComposerBuiltinChartVizConfig,
    type ComposerStoredChartVizConfig,
} from '../../composer/composerChartVizConfigSchema';
import { type ItemsMap } from '../../types/field';
import { type ResultColumn } from '../../types/results';
import { type ToolRunQueryArgsTransformed } from './schemas';

/** Builtin types Slack posts as a chart image; tables, big numbers and custom types are not images. */
export const isComposerSlackImageVizConfig = (
    vizConfig: ComposerStoredChartVizConfig,
): vizConfig is ComposerBuiltinChartVizConfig & {
    type: ComposerRunQueryBuilderVizType;
} =>
    vizConfig.type === 'bar' ||
    vizConfig.type === 'line' ||
    vizConfig.type === 'area' ||
    vizConfig.type === 'scatter' ||
    vizConfig.type === 'pie' ||
    vizConfig.type === 'funnel';

/**
 * A builtin composer chart as runQuery tool args over the chart's fields only,
 * for the Slack image builders; null for types Slack posts as a link or table.
 */
export const getComposerSlackRunQueryChart = ({
    columns: resultColumns,
    rows,
    vizConfig,
    metadata,
}: {
    columns: ResultColumn[];
    rows: Record<string, unknown>[];
    vizConfig: ComposerStoredChartVizConfig;
    metadata: { title: string; description: string };
}): {
    tool: ToolRunQueryArgsTransformed;
    rows: Record<string, unknown>[];
    fields: ItemsMap;
} | null => {
    if (!isComposerSlackImageVizConfig(vizConfig)) return null;
    const { metricQuery, fields, chartConfig } =
        getComposerRunQueryBuilderInput(resultColumns, vizConfig);
    return {
        tool: {
            ...metadata,
            queryConfig: {
                exploreName: COMPOSER_RESULT_TABLE_NAME,
                dimensions: metricQuery.dimensions,
                metrics: metricQuery.metrics,
                sorts: [],
                limit: null,
                parameters: null,
                customMetrics: null,
                tableCalculations: null,
                filters: {},
            },
            chartConfig,
            mergeConfig: null,
        },
        rows: toComposerResultRows({ metricQuery, fields }, rows),
        fields,
    };
};
