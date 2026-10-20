import {
    buildComposerArtifactPipeline,
    isAiComposerChartArtifactConfig,
    isAiSqlChartArtifactConfig,
    parseToolComposerQueriesSuccessMetadata,
    QuerySourceType,
    type AiAgentToolResult,
    type AiArtifact,
    type ItemsMap,
    type ThreadComposerQueryNode,
} from '@lightdash/common';
import { z } from 'zod';
import {
    SLACK_TABLE_MAX_ROWS,
    type SlackTablePreview,
    type SlackTableQueryResults,
} from './slackTableBlocks';

// Stored results contain metadata and model text, not live structuredContent.
// Only the execution id is needed to read the original cached rows.
const queryResultMetadataSchema = z.object({
    status: z.literal('success'),
    queryUuid: z.string().min(1),
    artifactVersionUuid: z.string().optional(),
});
const queryConfigSchema = z.object({ exploreName: z.string().min(1) });
const tableCallArgsSchema = z.object({
    title: z.string().nullish(),
    queryConfig: queryConfigSchema,
    chartConfig: z.object({ defaultVizType: z.string().optional() }).nullish(),
    mergeConfig: z
        .object({
            additionalSources: z.array(
                z.object({ queryConfig: queryConfigSchema }),
            ),
        })
        .nullish(),
});

export const isSlackTableArtifact = (artifact: AiArtifact): boolean => {
    const { chartConfig } = artifact;
    if (
        !chartConfig ||
        isAiSqlChartArtifactConfig(chartConfig) ||
        isAiComposerChartArtifactConfig(chartConfig)
    ) {
        return false;
    }
    const args = tableCallArgsSchema.safeParse(chartConfig.config);
    return (
        args.success &&
        (!args.data.chartConfig ||
            args.data.chartConfig.defaultVizType === 'table')
    );
};

/** Semantic explores the presented node reads, through every node it reads;
 * null when its closure is not registered. */
const getComposerExploreNames = (
    terminalNodeId: string,
    threadNodes: ThreadComposerQueryNode[],
): string[] | null => {
    const terminalNode = threadNodes.find(
        (node) => node.nodeId === terminalNodeId,
    );
    if (!terminalNode) return null;
    try {
        return [
            ...new Set(
                buildComposerArtifactPipeline({
                    queries: [terminalNode],
                    threadNodes,
                }).flatMap((node) =>
                    node.sourceType === QuerySourceType.SEMANTIC_LAYER
                        ? [node.exploreName]
                        : [],
                ),
            ),
        ];
    } catch {
        return null;
    }
};

export const getSlackTablePreviews = async ({
    enableDataAccess,
    slackLinksOnly,
    selectedQueryUuids,
    toolCalls,
    toolResults,
    artifacts,
    threadNodes,
    url,
    runtimeResults = new Map(),
    authorize,
    getResults,
    onLoadError,
}: {
    enableDataAccess: boolean;
    slackLinksOnly: boolean;
    selectedQueryUuids: string[];
    toolCalls: Array<{
        tool_call_id: string;
        tool_name: string;
        tool_args: unknown;
    }>;
    toolResults: Array<
        Pick<AiAgentToolResult, 'toolType' | 'toolCallId' | 'toolName'> & {
            metadata: unknown;
        }
    >;
    artifacts: AiArtifact[];
    /** The thread's registered composer query nodes. */
    threadNodes: ThreadComposerQueryNode[];
    url: string;
    runtimeResults?: ReadonlyMap<string, SlackTableQueryResults>;
    authorize: (input: {
        queryUuid: string;
        exploreNames: string[];
    }) => Promise<void>;
    getResults: (input: {
        queryUuid: string;
        exploreNames: string[];
        maxRows: number;
    }) => Promise<{
        rows: Record<string, unknown>[];
        fields: ItemsMap;
        truncated: boolean;
    }>;
    onLoadError: (toolCallId: string) => void;
}): Promise<Array<SlackTablePreview & { artifactVersionUuid?: string }>> => {
    if (!enableDataAccess || slackLinksOnly || selectedQueryUuids.length === 0)
        return [];

    const resultsByCall = new Map(
        toolResults
            .filter((result) => result.toolType === 'built-in')
            .map((result) => [result.toolCallId, result]),
    );
    const artifactsByVersion = new Map(
        artifacts.map((artifact) => [artifact.versionUuid, artifact]),
    );
    type TableCall = {
        call: (typeof toolCalls)[number];
        title: string | null;
        exploreNames: string[];
        metadata: { queryUuid: string };
        artifact: AiArtifact | undefined;
    };
    const tableCalls = toolCalls.flatMap((call): TableCall[] => {
        if (
            ![
                'runQuery',
                'generateVisualization',
                'runComposerQueries',
            ].includes(call.tool_name)
        ) {
            return [];
        }
        const toolMetadata = resultsByCall.get(call.tool_call_id)?.metadata;
        if (call.tool_name === 'runComposerQueries') {
            const composer =
                parseToolComposerQueriesSuccessMetadata(toolMetadata);
            if (!composer) return [];
            const exploreNames = getComposerExploreNames(
                composer.terminalNodeId,
                threadNodes,
            );
            if (!exploreNames) return [];
            return [
                {
                    call,
                    title: composer.title,
                    exploreNames,
                    metadata: { queryUuid: composer.queryUuid },
                    artifact: undefined,
                },
            ];
        }
        const metadata = queryResultMetadataSchema.safeParse(toolMetadata);
        if (!metadata.success) return [];
        const artifact = metadata.data.artifactVersionUuid
            ? artifactsByVersion.get(metadata.data.artifactVersionUuid)
            : undefined;
        const chartConfig = artifact?.chartConfig;
        if (
            chartConfig &&
            (isAiSqlChartArtifactConfig(chartConfig) ||
                isAiComposerChartArtifactConfig(chartConfig))
        ) {
            return [];
        }
        // Use the saved presentation: the query tool may have corrected the
        // proposed visualization type before executing and saving the artifact.
        const args = tableCallArgsSchema.safeParse(
            chartConfig?.config ?? call.tool_args,
        );
        if (!args.success) return [];
        if (
            args.data.chartConfig &&
            args.data.chartConfig.defaultVizType !== 'table'
        ) {
            return [];
        }
        return [
            {
                call,
                title: artifact?.title || args.data.title || null,
                exploreNames: [
                    ...new Set([
                        args.data.queryConfig.exploreName,
                        ...(args.data.mergeConfig?.additionalSources.map(
                            (source) => source.queryConfig.exploreName,
                        ) ?? []),
                    ]),
                ],
                metadata: metadata.data,
                artifact,
            },
        ];
    });

    const callsByQuery = new Map(
        tableCalls.map((tableCall) => [
            tableCall.metadata.queryUuid,
            tableCall,
        ]),
    );
    // Only the final answer's selected executions are shared. Bound previews
    // and preserve presentation order, including when a query was reused.
    const selectedCalls = [...new Set(selectedQueryUuids)].flatMap(
        (queryUuid) => {
            const tableCall = callsByQuery.get(queryUuid);
            return tableCall ? [tableCall] : [];
        },
    );
    return Promise.all(
        selectedCalls
            .slice(0, 10)
            .map(async ({ call, title, exploreNames, metadata, artifact }) => {
                const preview = {
                    blockId: `ai_agent_table_${call.tool_call_id}`,
                    title: title || 'Query results',
                    url,
                    ...(artifact
                        ? { artifactVersionUuid: artifact.versionUuid }
                        : {}),
                };
                try {
                    await authorize({
                        queryUuid: metadata.queryUuid,
                        exploreNames,
                    });
                    // Approval resumes and retries have a new runtime context.
                    const queryResults =
                        runtimeResults.get(metadata.queryUuid) ??
                        (await getResults({
                            queryUuid: metadata.queryUuid,
                            exploreNames,
                            maxRows: SLACK_TABLE_MAX_ROWS,
                        }));
                    return {
                        ...preview,
                        status: 'ready' as const,
                        queryResults,
                        truncated: queryResults.truncated,
                    };
                } catch {
                    // Missing/expired or newly inaccessible cached results must not
                    // fail the answer. The exact thread remains accessible by link.
                    onLoadError(call.tool_call_id);
                    return {
                        ...preview,
                        status: 'unavailable' as const,
                    };
                }
            }),
    );
};
