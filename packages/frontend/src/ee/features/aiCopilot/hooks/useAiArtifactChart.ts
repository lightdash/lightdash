import {
    assertUnreachable,
    getDataAppVizChartFromArtifact,
    type AiChartArtifactConfig,
    type AiLegacySemanticChartArtifactConfig,
    type ApiAiAgentThreadMessageVizQuery,
    type DataAppVizChart,
} from '@lightdash/common';
import { useCompiledSqlFromMetricQuery } from '../../../../hooks/useCompiledSql';
import { useAiMergeCompiledSql } from './useAiMergeCompiledSql';

type AiArtifactChartSource = {
    isMergeArtifact: boolean;
    /** Tool args driving the semantic query render paths, when any. */
    semanticChartConfig: AiLegacySemanticChartArtifactConfig | null;
    /** Set for custom chart type answers: uuid from the envelope + mapping. */
    customChartType: DataAppVizChart | null;
};

/** Resolves an artifact's chart config into the shape the renderers consume. */
export const getAiArtifactChartSource = (
    chartConfig: AiChartArtifactConfig | null | undefined,
): AiArtifactChartSource => {
    if (!chartConfig) {
        return {
            isMergeArtifact: false,
            semanticChartConfig: null,
            customChartType: null,
        };
    }
    switch (chartConfig.source) {
        case 'semantic':
            return {
                isMergeArtifact: false,
                semanticChartConfig: chartConfig.config,
                customChartType: null,
            };
        case 'merge':
            return {
                isMergeArtifact: true,
                semanticChartConfig: chartConfig.config,
                customChartType: null,
            };
        case 'customChartType':
            return {
                isMergeArtifact: false,
                semanticChartConfig: chartConfig.config,
                customChartType: getDataAppVizChartFromArtifact(chartConfig),
            };
        case 'sql':
        case 'composer':
            return {
                isMergeArtifact: false,
                semanticChartConfig: null,
                customChartType: null,
            };
        default:
            return assertUnreachable(
                chartConfig,
                'Unknown AI artifact chart config source',
            );
    }
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
