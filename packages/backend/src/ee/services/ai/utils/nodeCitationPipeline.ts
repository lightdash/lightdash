import {
    buildComposerArtifactPipeline,
    QuerySourceType,
    type AiAgentNodeCitationPipeline,
    type ThreadComposerQueryNode,
} from '@lightdash/common';

/** The node and everything it reads, the node terminal; null when not in the thread. */
export const buildNodeCitationPipeline = ({
    nodeId,
    threadNodes,
}: {
    nodeId: string;
    threadNodes: ThreadComposerQueryNode[];
}): AiAgentNodeCitationPipeline | null => {
    const cited = threadNodes.find((node) => node.nodeId === nodeId);
    if (!cited) return null;
    return {
        nodeId,
        title: cited.title ?? null,
        nodes: buildComposerArtifactPipeline({
            queries: [cited],
            threadNodes,
        }),
    };
};

export const nodeCitationReadsWarehouseSql = (
    pipeline: AiAgentNodeCitationPipeline,
): boolean =>
    pipeline.nodes.some((node) => node.sourceType === QuerySourceType.SQL);
