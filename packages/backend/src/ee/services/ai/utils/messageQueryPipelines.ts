import {
    buildComposerArtifactPipeline,
    isComposerQueryToolName,
    parsePartialToolComposerQueriesArgs,
    parseToolComposerQueriesSuccessMetadata,
    type AiAgentMessageQueryPipeline,
    type AiAgentToolCall,
    type AiAgentToolResult,
    type ThreadComposerQueryNode,
} from '@lightdash/common';

/**
 * Pipelines of a turn's successful `query` calls, rebuilt from the thread's
 * registered nodes so reused nodes from earlier turns are included.
 */
export const buildMessageQueryPipelines = ({
    toolCalls,
    threadNodes,
}: {
    toolCalls: Array<{
        toolCall: AiAgentToolCall;
        toolResult: AiAgentToolResult | null;
    }>;
    threadNodes: ThreadComposerQueryNode[];
}): AiAgentMessageQueryPipeline[] => {
    const nodesById = new Map(threadNodes.map((node) => [node.nodeId, node]));
    return toolCalls.flatMap(({ toolCall, toolResult }) => {
        if (!isComposerQueryToolName(toolCall.toolName)) return [];
        const metadata = parseToolComposerQueriesSuccessMetadata(
            toolResult?.metadata,
        );
        const args = parsePartialToolComposerQueriesArgs(toolCall.toolArgs);
        if (!metadata || !args) return [];
        const submitted = args.queries.flatMap((query) => {
            const node = nodesById.get(query.nodeId);
            return node ? [node] : [];
        });
        const nodes = buildComposerArtifactPipeline({
            queries: submitted,
            threadNodes,
        });
        const terminal = nodes.find(
            (node) => node.nodeId === metadata.terminalNodeId,
        );
        return [
            {
                queryUuid: metadata.queryUuid,
                title: args.title ?? terminal?.title ?? metadata.terminalNodeId,
                terminalNodeId: metadata.terminalNodeId,
                nodes,
            },
        ];
    });
};
