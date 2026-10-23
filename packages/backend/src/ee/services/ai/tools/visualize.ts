import {
    buildComposerArtifactPipeline,
    isComposerSlackImageVizConfig,
    isSlackPrompt,
    ParameterError,
    QuerySourceType,
    toComposerChartArtifactVersion,
    toComposerSemanticArtifactVersion,
    visualizeToolDefinition,
    type AiComposerArtifactVersion,
    type AiComposerSemanticArtifactVersion,
    type ComposerChartVizConfig,
    type ComposerPipelineNode,
    type ComposerStoredChartVizConfig,
    type ThreadComposerQueryNode,
} from '@lightdash/common';
import { tool } from 'ai';
import Logger from '../../../../logging/logger';
import {
    composerChartQualityHints,
    composerChartQualityHintsNeedRows,
    formatChartReadabilityNotes,
} from '../decisions/chartQuality';
import type {
    CreateOrUpdateArtifactFn,
    DeferSlackVisualizationFn,
    GetPromptFn,
    ListThreadComposerQueryNodesFn,
    ResolveCustomChartTypeFn,
    RunComposerQueriesFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    getPrompt: GetPromptFn;
    listThreadComposerQueryNodes: ListThreadComposerQueryNodesFn;
    runComposerQueries: RunComposerQueriesFn;
    resolveCustomChartType: ResolveCustomChartTypeFn;
    createOrUpdateArtifact: CreateOrUpdateArtifactFn;
    updateProgress: UpdateProgressFn;
    deferSlackVisualization?: DeferSlackVisualizationFn;
    slackLinksOnly: boolean;
    maxQueryLimit: number;
};

type VisualizeOutput =
    | ExecuteStructuredToolResult<
          { nodeId: string; hints: string[] },
          {
              status: 'success';
              nodeId: string;
              artifactUuid: string;
              versionUuid: string;
              queryUuid: string | null;
          }
      >
    | ExecuteToolErrorResult;

const toolDefinition = visualizeToolDefinition.for('agent');

const unknownNodeMessage = (
    nodeId: string,
    threadNodes: ThreadComposerQueryNode[],
): string =>
    threadNodes.length === 0
        ? `Node "${nodeId}" is not a node of this thread: no query call has succeeded in this thread yet. Run query first.`
        : `Node "${nodeId}" is not a node of this thread. Nodes in this thread: ${threadNodes
              .map((node) => `${node.nodeId} ("${node.title ?? node.nodeId}")`)
              .join(', ')}.`;

// A custom chart type pins the version resolved now, so later edits to the type leave this card as drawn.
const toStoredVizConfig = async (
    vizConfig: ComposerChartVizConfig,
    resolveCustomChartType: ResolveCustomChartTypeFn,
): Promise<ComposerStoredChartVizConfig> => {
    if (vizConfig.type !== 'custom') return vizConfig;
    const resolved = await resolveCustomChartType(
        vizConfig.customChartTypeSlug,
    );
    if (!resolved) {
        throw new ParameterError(
            `Custom chart type "${vizConfig.customChartTypeSlug}" was not found in this project. Use the slug of one of the project's custom chart types, or a built-in type.`,
        );
    }
    return {
        ...vizConfig,
        dataAppVizUuid: resolved.dataAppVizUuid,
        dataAppVizVersion: resolved.dataAppVizVersion,
    };
};

// A lone semantic-layer node presents as a classic semantic version, keeping its interactions.
const toArtifactVersion = ({
    title,
    description,
    queries,
    terminalNodeId,
    vizConfig,
    maxQueryLimit,
}: {
    title: string;
    description: string | null;
    queries: ComposerPipelineNode[];
    terminalNodeId: string;
    vizConfig: ComposerStoredChartVizConfig;
    maxQueryLimit: number;
}): AiComposerArtifactVersion | AiComposerSemanticArtifactVersion => {
    const [node, ...rest] = queries;
    const semantic =
        rest.length === 0 && node.sourceType === QuerySourceType.SEMANTIC_LAYER
            ? toComposerSemanticArtifactVersion({
                  title,
                  description,
                  node,
                  vizConfig,
                  maxQueryLimit,
              })
            : null;
    return (
        semantic ??
        toComposerChartArtifactVersion({
            title,
            description,
            queries,
            terminalNodeId,
            vizConfig,
        })
    );
};

export const getVisualize = ({
    getPrompt,
    listThreadComposerQueryNodes,
    runComposerQueries,
    resolveCustomChartType,
    createOrUpdateArtifact,
    updateProgress,
    deferSlackVisualization,
    slackLinksOnly,
    maxQueryLimit,
}: Dependencies) =>
    tool({
        description: toolDefinition.description,
        inputSchema: toolDefinition.inputSchema,
        outputSchema: toolDefinition.outputSchema,
        toModelOutput: toolDefinition.toModelOutput,
        execute: async ({
            nodeId,
            title,
            description,
            vizConfig,
        }): Promise<VisualizeOutput> => {
            try {
                const prompt = await getPrompt();
                const { threadUuid, promptUuid } = prompt;
                const threadNodes =
                    await listThreadComposerQueryNodes(threadUuid);
                const node = threadNodes.find((n) => n.nodeId === nodeId);
                if (!node) {
                    throw new ParameterError(
                        unknownNodeMessage(nodeId, threadNodes),
                    );
                }
                const queries = buildComposerArtifactPipeline({
                    queries: [node],
                    threadNodes,
                });

                const storedVizConfig = await toStoredVizConfig(
                    vizConfig,
                    resolveCustomChartType,
                );

                await updateProgress('Visualizing result...');
                const needsHints = composerChartQualityHintsNeedRows(vizConfig);
                // Slack posts a table, or a chart image, from this execution's rows.
                const slackImage =
                    isSlackPrompt(prompt) &&
                    !slackLinksOnly &&
                    !!deferSlackVisualization &&
                    isComposerSlackImageVizConfig(storedVizConfig);
                const needsRows =
                    (isSlackPrompt(prompt) && vizConfig.type === 'table') ||
                    slackImage;
                // Usually a results cache hit; a failed run only drops hints and Slack results.
                const run =
                    needsHints || needsRows
                        ? await runComposerQueries({
                              queries,
                              terminalNodeId: nodeId,
                          }).catch(() => null)
                        : null;
                const hints =
                    run && needsHints
                        ? composerChartQualityHints(vizConfig, run.terminal)
                        : [];

                const artifact = await createOrUpdateArtifact({
                    threadUuid,
                    promptUuid,
                    ...toArtifactVersion({
                        title,
                        description,
                        queries,
                        terminalNodeId: nodeId,
                        vizConfig: storedVizConfig,
                        maxQueryLimit,
                    }),
                });

                if (slackImage && run && run.terminal.rows.length > 0) {
                    // The answer keeps its link card if the image cannot be registered.
                    await deferSlackVisualization({
                        source: 'composer',
                        artifactUuid: artifact.artifactUuid,
                        versionUuid: artifact.versionUuid,
                        queryUuid: run.terminal.queryUuid,
                        rowLimit: run.terminal.rows.length,
                    }).catch(() =>
                        Logger.warn(
                            '[AiAgent] Deferred Slack composer image unavailable; retaining the chart link.',
                        ),
                    );
                }

                return {
                    result: [
                        `Visualized node "${nodeId}" for the user as a ${vizConfig.type} card.`,
                        formatChartReadabilityNotes(hints),
                    ]
                        .filter(Boolean)
                        .join(' '),
                    metadata: {
                        status: 'success',
                        nodeId,
                        artifactUuid: artifact.artifactUuid,
                        versionUuid: artifact.versionUuid,
                        queryUuid: run?.terminal.queryUuid ?? null,
                    },
                    structuredContent: { nodeId, hints },
                };
            } catch (e) {
                return toolErrorOutput(e, 'Error visualizing the node.');
            }
        },
    });
