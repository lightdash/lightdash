import { type EChartsOption } from 'echarts';
import { type ResultColumn } from '../../../../types/results';
import { getComposerSlackRunQueryChart } from '../../composerChartVizConfig';
import { type ComposerStoredChartVizConfig } from '../../schemas';
import { AiResultType } from '../../types';
import { getSlackAiEchartsConfig } from './getSlackAiEchartsConfig';
import { type GetPivotedResultsFn } from './types';

/** A composer chart drawn by the runQuery Slack echarts builders; null when Slack posts no image. */
export const getComposerSlackEchartsConfig = async ({
    columns,
    rows,
    vizConfig,
    metadata,
    getPivotedResults,
}: {
    columns: ResultColumn[];
    rows: Record<string, unknown>[];
    vizConfig: ComposerStoredChartVizConfig;
    metadata: { title: string; description: string };
    getPivotedResults: GetPivotedResultsFn;
}): Promise<EChartsOption | null> => {
    const chart = getComposerSlackRunQueryChart({
        columns,
        rows,
        vizConfig,
        metadata,
    });
    if (!chart) return null;
    return getSlackAiEchartsConfig({
        toolArgs: { type: AiResultType.QUERY_RESULT, tool: chart.tool },
        queryResults: { rows: chart.rows, fields: chart.fields },
        getPivotedResults,
    });
};
