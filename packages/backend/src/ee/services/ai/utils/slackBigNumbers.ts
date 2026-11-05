import {
    getComposerBigNumber,
    getComposerSemanticExploreNames,
    isAiComposerChartArtifactConfig,
    parseToolVisualizeSuccessMetadata,
    type AiAgentToolResult,
    type AiArtifact,
    type ComposerBigNumber,
    type ResultColumn,
} from '@lightdash/common';

/** Values of the big numbers visualize presented, by artifact version; a missing version keeps its link card. */
export const getSlackBigNumbers = async ({
    enableDataAccess,
    slackLinksOnly,
    toolResults,
    artifacts,
    authorize,
    getResult,
    onLoadError,
}: {
    enableDataAccess: boolean;
    slackLinksOnly: boolean;
    toolResults: Array<
        Pick<AiAgentToolResult, 'toolType' | 'toolName'> & {
            metadata: unknown;
        }
    >;
    artifacts: AiArtifact[];
    authorize: (input: {
        queryUuid: string;
        exploreNames: string[];
    }) => Promise<void>;
    getResult: (input: { queryUuid: string }) => Promise<{
        columns: ResultColumn[];
        rows: Record<string, unknown>[];
    }>;
    onLoadError: (versionUuid: string) => void;
}): Promise<Map<string, ComposerBigNumber>> => {
    if (!enableDataAccess || slackLinksOnly) return new Map();
    const artifactsByVersion = new Map(
        artifacts.map((artifact) => [artifact.versionUuid, artifact]),
    );
    const bigNumbers = toolResults.flatMap((result) => {
        if (result.toolType !== 'built-in' || result.toolName !== 'visualize')
            return [];
        const metadata = parseToolVisualizeSuccessMetadata(result.metadata);
        const chartConfig = metadata
            ? artifactsByVersion.get(metadata.versionUuid)?.chartConfig
            : undefined;
        if (
            !metadata?.queryUuid ||
            !isAiComposerChartArtifactConfig(chartConfig) ||
            chartConfig.schemaVersion !== 2 ||
            chartConfig.vizConfig?.type !== 'big_number'
        )
            return [];
        return [
            {
                versionUuid: metadata.versionUuid,
                queryUuid: metadata.queryUuid,
                vizConfig: chartConfig.vizConfig,
                exploreNames: getComposerSemanticExploreNames(
                    chartConfig.queries,
                ),
            },
        ];
    });
    const entries = await Promise.all(
        bigNumbers.map(
            async ({ versionUuid, queryUuid, vizConfig, exploreNames }) => {
                try {
                    await authorize({ queryUuid, exploreNames });
                    const { columns, rows } = await getResult({ queryUuid });
                    const bigNumber = getComposerBigNumber({
                        columns,
                        rows,
                        vizConfig,
                    });
                    return bigNumber
                        ? ([[versionUuid, bigNumber]] as const)
                        : [];
                } catch {
                    onLoadError(versionUuid);
                    return [];
                }
            },
        ),
    );
    return new Map(entries.flat());
};
