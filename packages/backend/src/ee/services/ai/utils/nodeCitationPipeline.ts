import {
    buildComposerArtifactPipeline,
    type AiAgentNodeCitationPipeline,
    type ThreadComposerQueryNode,
} from '@lightdash/common';

/** A cited node's preview pipeline; null when the thread never registered the node. */
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
