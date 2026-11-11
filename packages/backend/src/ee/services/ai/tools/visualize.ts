import {
    assertUnreachable,
    buildComposerArtifactPipeline,
    COMPOSER_VIZ_MISSING_X_ERROR,
    DimensionType,
    getComposerVizConfigReferenceErrors,
    getSourceQueryResultReferences,
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
    type Explore,
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
    getExplore: (exploreName: string) => Explore | null;
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

const describeColumns = (columns: ComposerNodeColumn[]): string =>
    columns.map(({ reference, type }) => `${reference} (${type})`).join(', ');

// Points a chart without an x column to the nodes it reads that have one, from stored columns only.
const getBreakdownPointers = async ({
    threadUuid,
    node,
    getThreadComposerNodeColumns,
}: {
    threadUuid: string;
    node: ThreadComposerQueryNode;
    getThreadComposerNodeColumns: GetThreadComposerNodeColumnsFn;
}): Promise<string[]> => {
    const upstreamNodeIds = [
        ...new Set(Object.values(getSourceQueryResultReferences(node))),
    ];
    const pointers = await Promise.all(
        upstreamNodeIds.map(async (upstreamNodeId) => {
            // A failed lookup drops only the pointer, never the x error.
            const columns = await getThreadComposerNodeColumns({
                threadUuid,
                nodeId: upstreamNodeId,
            }).catch(() => null);
            const categories = (columns ?? []).filter(
                ({ type }) => type !== DimensionType.NUMBER,
            );
            return categories.length === 0
                ? null
                : `Node "${upstreamNodeId}" has ${describeColumns(categories)}: visualize it directly, no new query needed.`;
        }),
    );
    return pointers.filter((pointer): pointer is string => pointer !== null);
};

const assertVizConfigReferences = async ({
    threadUuid,
    node,
    columns,
    vizConfig,
    customChartTypeSlots,
    getThreadComposerNodeColumns,
}: {
    threadUuid: string;
    node: ThreadComposerQueryNode;
    columns: ComposerNodeColumn[];
    vizConfig: ComposerChartVizConfig;
    customChartTypeSlots: ComposerCustomChartTypeSlotSpec[];
    getThreadComposerNodeColumns: GetThreadComposerNodeColumnsFn;
}): Promise<void> => {
    const errors = getComposerVizConfigReferenceErrors({
        columns,
        vizConfig,
        customChartTypeSlots,
    });
    if (errors.length === 0) return;
    const { nodeId } = node;
    const pointers = errors.includes(COMPOSER_VIZ_MISSING_X_ERROR)
        ? await getBreakdownPointers({
              threadUuid,
              node,
              getThreadComposerNodeColumns,
          })
        : [];
    throw new ParameterError(
        [
            `vizConfig does not match node "${nodeId}": ${errors.join('; ')}. Columns of node "${nodeId}": ${describeColumns(columns)}.`,
            ...pointers,
        ].join('\n'),
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
    getExplore,
}: {
    title: string;
    description: string | null;
    queries: ComposerPipelineNode[];
    terminalNodeId: string;
    vizConfig: ComposerStoredChartVizConfig;
    maxQueryLimit: number;
    getExplore: Dependencies['getExplore'];
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
                  explore: getExplore(node.exploreName),
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
    getExplore,
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
                              otherUnreadNodeIds: [],
                              sampleNodeIds: [],
                          })
                              .then((outcome) =>
                                  outcome.status === 'success' ? outcome : null,
                              )
                              .catch(() => null)
                        : null;
                const columns = run
                    ? toComposerNodeColumns(run.terminal.columns)
                    : await getThreadComposerNodeColumns({
                          threadUuid,
                          nodeId,
                      });
                if (columns) {
                    await assertVizConfigReferences({
                        threadUuid,
                        node,
                        columns,
                        vizConfig,
                        customChartTypeSlots,
                        getThreadComposerNodeColumns,
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
                    getExplore,
                });
                const artifact = await createOrUpdateArtifact({
                    threadUuid,
                    promptUuid,
                    ...version,
                });

                const slackRenderInput =
                    slackImage && run && run.terminal.rowCount > 0
                        ? toSlackRenderInput(version, {
                              artifactUuid: artifact.artifactUuid,
                              versionUuid: artifact.versionUuid,
                              queryUuid: run.terminal.queryUuid,
                              rowLimit: run.terminal.rowCount,
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
