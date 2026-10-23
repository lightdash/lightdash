import {
    assertUnreachable,
    buildComposerArtifactPipeline,
    getComposerVizConfigReferenceErrors,
    isComposerSlackImageVizConfig,
    isSlackPrompt,
    ParameterError,
    parsePersistedRunQueryPayload,
    QuerySourceType,
    toComposerChartArtifactVersion,
    toComposerNodeColumns,
    toComposerSemanticArtifactVersion,
    visualizeToolDefinition,
    type AiComposerArtifactVersion,
    type AiComposerSemanticArtifactVersion,
    type ComposerChartVizConfig,
    type ComposerCustomChartTypeSlotSpec,
    type ComposerNodeColumn,
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
    GetThreadComposerNodeColumnsFn,
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
    getThreadComposerNodeColumns: GetThreadComposerNodeColumnsFn;
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

const assertVizConfigReferences = ({
    nodeId,
    columns,
    vizConfig,
    customChartTypeSlots,
}: {
    nodeId: string;
    columns: ComposerNodeColumn[];
    vizConfig: ComposerChartVizConfig;
    customChartTypeSlots: ComposerCustomChartTypeSlotSpec[];
}): void => {
    const errors = getComposerVizConfigReferenceErrors({
        columns,
        vizConfig,
        customChartTypeSlots,
    });
    if (errors.length === 0) return;
    throw new ParameterError(
        `vizConfig does not match node "${nodeId}": ${errors.join('; ')}. Columns of node "${nodeId}": ${columns
            .map(({ reference, type }) => `${reference} (${type})`)
            .join(', ')}.`,
    );
};

// A custom chart type pins the version resolved now, so later edits to the type leave this card as drawn.
const resolveVizConfig = async (
    vizConfig: ComposerChartVizConfig,
    resolveCustomChartType: ResolveCustomChartTypeFn,
): Promise<{
    storedVizConfig: ComposerStoredChartVizConfig;
    customChartTypeSlots: ComposerCustomChartTypeSlotSpec[];
}> => {
    if (vizConfig.type !== 'custom') {
        return { storedVizConfig: vizConfig, customChartTypeSlots: [] };
    }
    const resolved = await resolveCustomChartType(
        vizConfig.customChartTypeSlug,
    );
    if (!resolved) {
        throw new ParameterError(
            `Custom chart type "${vizConfig.customChartTypeSlug}" was not found in this project. Use the slug of one of the project's custom chart types, or a built-in type.`,
        );
    }
    return {
        storedVizConfig: {
            ...vizConfig,
            dataAppVizUuid: resolved.dataAppVizUuid,
            dataAppVizVersion: resolved.dataAppVizVersion,
        },
        customChartTypeSlots: resolved.schema.fields,
    };
};

const toPresentedArtifactVersion = ({
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

type SlackRenderInput = Parameters<DeferSlackVisualizationFn>[0];

// Classic versions draw through the runQuery Slack path, composer versions through their own.
const toSlackRenderInput = (
    {
        vizConfig,
    }: AiComposerArtifactVersion | AiComposerSemanticArtifactVersion,
    execution: Omit<
        Extract<SlackRenderInput, { source: 'composer' }>,
        'source'
    >,
): SlackRenderInput | null => {
    switch (vizConfig.source) {
        case 'composer':
            return { source: 'composer', ...execution };
        case 'semantic': {
            const queryTool = parsePersistedRunQueryPayload(vizConfig.config);
            return queryTool
                ? { source: 'runQuery', ...execution, queryTool }
                : null;
        }
        case 'customChartType':
            return null;
        default:
            return assertUnreachable(vizConfig, 'Unknown artifact source');
    }
};

export const getVisualize = ({
    getPrompt,
    listThreadComposerQueryNodes,
    getThreadComposerNodeColumns,
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

                const { storedVizConfig, customChartTypeSlots } =
                    await resolveVizConfig(vizConfig, resolveCustomChartType);

                await updateProgress('Visualizing result...');
                const needsHints = composerChartQualityHintsNeedRows(vizConfig);
                // Slack posts a table, a big number or a chart image from this execution's rows.
                const slackImage =
                    isSlackPrompt(prompt) &&
                    !slackLinksOnly &&
                    !!deferSlackVisualization &&
                    isComposerSlackImageVizConfig(storedVizConfig);
                const slackBigNumber =
                    isSlackPrompt(prompt) &&
                    !slackLinksOnly &&
                    vizConfig.type === 'big_number';
                const needsRows =
                    (isSlackPrompt(prompt) && vizConfig.type === 'table') ||
                    slackImage ||
                    slackBigNumber;
                // Usually a results cache hit; a failed run only drops hints and Slack results.
                const run =
                    needsHints || needsRows
                        ? await runComposerQueries({
                              queries,
                              terminalNodeId: nodeId,
                          }).catch(() => null)
                        : null;
                const columns = run
                    ? toComposerNodeColumns(run.terminal.columns)
                    : await getThreadComposerNodeColumns({
                          threadUuid,
                          nodeId,
                      });
                if (columns) {
                    assertVizConfigReferences({
                        nodeId,
                        columns,
                        vizConfig,
                        customChartTypeSlots,
                    });
                }
                const hints =
                    run && needsHints
                        ? composerChartQualityHints(vizConfig, run.terminal)
                        : [];

                const version = toPresentedArtifactVersion({
                    title,
                    description,
                    queries,
                    terminalNodeId: nodeId,
                    vizConfig: storedVizConfig,
                    maxQueryLimit,
                });
                const artifact = await createOrUpdateArtifact({
                    threadUuid,
                    promptUuid,
                    ...version,
                });

                const slackRenderInput =
                    slackImage && run && run.terminal.rows.length > 0
                        ? toSlackRenderInput(version, {
                              artifactUuid: artifact.artifactUuid,
                              versionUuid: artifact.versionUuid,
                              queryUuid: run.terminal.queryUuid,
                              rowLimit: run.terminal.rows.length,
                          })
                        : null;
                if (slackRenderInput && deferSlackVisualization) {
                    // The answer keeps its link card if the image cannot be registered.
                    await deferSlackVisualization(slackRenderInput).catch(() =>
                        Logger.warn(
                            '[AiAgent] Deferred Slack image unavailable; retaining the chart link.',
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
