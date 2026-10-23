import {
    assertUnreachable,
    isAiComposerChartArtifactConfig,
    isComposerSlackImageVizConfig,
    QuerySourceType,
    type AiArtifact,
    type ComposerStoredChartVizConfig,
} from '@lightdash/common';
import { type SlackArtifactRenderInput } from '../../../database/entities/aiSlackArtifactDeliveries';
import { buildAiMergeSourceConfigs } from './buildAiMergeQuery';

export type SlackImageSource =
    | { source: 'runQuery'; exploreNames: string[] }
    | {
          source: 'composer';
          exploreNames: string[];
          vizConfig: ComposerStoredChartVizConfig;
      };

/** What a Slack image reads, or null when the artifact version cannot render this input. */
export const getSlackImageSource = (
    input: SlackArtifactRenderInput,
    chartConfig: AiArtifact['chartConfig'],
): SlackImageSource | null => {
    switch (input.source) {
        case 'runQuery': {
            if (
                !chartConfig ||
                !['semantic', 'merge', 'customChartType'].includes(
                    chartConfig.source,
                )
            )
                return null;
            const queries = input.queryTool.mergeConfig
                ? buildAiMergeSourceConfigs(input.queryTool).map(
                      ({ queryConfig }) => queryConfig,
                  )
                : [input.queryTool.queryConfig];
            return {
                source: 'runQuery',
                exploreNames: [
                    ...new Set(queries.map(({ exploreName }) => exploreName)),
                ],
            };
        }
        case 'composer': {
            if (
                !isAiComposerChartArtifactConfig(chartConfig) ||
                chartConfig.schemaVersion !== 2 ||
                !chartConfig.vizConfig ||
                !isComposerSlackImageVizConfig(chartConfig.vizConfig)
            )
                return null;
            return {
                source: 'composer',
                exploreNames: [
                    ...new Set(
                        chartConfig.queries.flatMap((node) =>
                            node.sourceType === QuerySourceType.SEMANTIC_LAYER
                                ? [node.exploreName]
                                : [],
                        ),
                    ),
                ],
                vizConfig: chartConfig.vizConfig,
            };
        }
        default:
            return assertUnreachable(input, 'Unknown Slack image source');
    }
};
