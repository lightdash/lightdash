import {
    buildComposerArtifactPipeline,
    ParameterError,
    toComposerChartArtifactVersion,
    visualizeToolDefinition,
    type ThreadComposerQueryNode,
} from '@lightdash/common';
import { tool } from 'ai';
import {
    composerChartQualityHints,
    hasComposerChartQualityHints,
} from '../decisions/chartQuality';
import type {
    CreateOrUpdateArtifactFn,
    GetPromptFn,
    ListThreadComposerQueryNodesFn,
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
    createOrUpdateArtifact: CreateOrUpdateArtifactFn;
    updateProgress: UpdateProgressFn;
};

type VisualizeOutput =
    | ExecuteStructuredToolResult<
          { nodeId: string; hints: string[] },
          {
              status: 'success';
              nodeId: string;
              artifactUuid: string;
              versionUuid: string;
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

export const getVisualize = ({
    getPrompt,
    listThreadComposerQueryNodes,
    runComposerQueries,
    createOrUpdateArtifact,
    updateProgress,
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
                const { threadUuid, promptUuid } = await getPrompt();
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

                await updateProgress('Building chart...');
                // Hints read the node's rows; the run is usually a results cache hit.
                const hints = hasComposerChartQualityHints(vizConfig)
                    ? composerChartQualityHints(
                          vizConfig,
                          (
                              await runComposerQueries({
                                  queries,
                                  terminalNodeId: nodeId,
                              })
                          ).terminal,
                      )
                    : [];

                const artifact = await createOrUpdateArtifact({
                    threadUuid,
                    promptUuid,
                    ...toComposerChartArtifactVersion({
                        title,
                        description,
                        queries,
                        terminalNodeId: nodeId,
                        vizConfig,
                    }),
                });

                return {
                    result: [
                        `Showed node "${nodeId}" to the user as a ${vizConfig.type} card.`,
                        ...(hints.length > 0
                            ? [
                                  `Chart readability: ${hints.join(' ')} Do not remove requested categories or change query scope merely to simplify the chart.`,
                              ]
                            : []),
                    ].join(' '),
                    metadata: {
                        status: 'success',
                        nodeId,
                        artifactUuid: artifact.artifactUuid,
                        versionUuid: artifact.versionUuid,
                    },
                    structuredContent: { nodeId, hints },
                };
            } catch (e) {
                return toolErrorOutput(e, 'Error visualizing the node.');
            }
        },
    });
