import {
    isAiMergeChartArtifactConfig,
    type AiChartArtifactConfig,
    type ApiAiAgentThreadMessageVizQuery,
} from '@lightdash/common';
import { useCompiledSqlFromMetricQuery } from '../../../../hooks/useCompiledSql';
import { useAiMergeCompiledSql } from './useAiMergeCompiledSql';

/** Resolves an artifact's chart config into the shape the renderers consume. */
export const getAiArtifactChartSource = (
    chartConfig: AiChartArtifactConfig | null | undefined,
) => {
    const mergeChartConfig = isAiMergeChartArtifactConfig(chartConfig)
        ? chartConfig
        : null;
    return {
        isMergeArtifact: mergeChartConfig !== null,
        semanticChartConfig:
            chartConfig?.source === 'semantic'
                ? chartConfig.config
                : (mergeChartConfig?.config ?? null),
    };
};

/** The SQL behind an artifact's View SQL action, for both query shapes. */
export const useAiArtifactCompiledSql = ({
    projectUuid,
    isMergeArtifact,
    vizQueryData,
}: {
    projectUuid: string | undefined;
    isMergeArtifact: boolean;
    vizQueryData: ApiAiAgentThreadMessageVizQuery | undefined;
}): string | undefined => {
    const { data: compiledSql } = useCompiledSqlFromMetricQuery({
        tableName: isMergeArtifact
            ? undefined
            : vizQueryData?.query.metricQuery?.exploreName,
        projectUuid,
        metricQuery: isMergeArtifact
            ? undefined
            : vizQueryData?.query.metricQuery,
    });
    const { data: mergeCompiledSql } = useAiMergeCompiledSql(
        projectUuid,
        isMergeArtifact ? vizQueryData : undefined,
    );
    return isMergeArtifact
        ? (mergeCompiledSql?.sql ?? undefined)
        : compiledSql?.query;
};
