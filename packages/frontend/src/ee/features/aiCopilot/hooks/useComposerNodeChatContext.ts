import { useCallback, useMemo } from 'react';
import {
    addThreadComposerNode,
    selectThreadComposerNodes,
} from '../store/aiAgentThreadComposerNodesSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../store/hooks';

/** Attaches pipeline nodes of one artifact version to the thread's chat input. */
export const useComposerNodeChatContext = ({
    threadUuid,
    artifactUuid,
    versionUuid,
}: {
    threadUuid: string;
    artifactUuid: string;
    versionUuid: string;
}): {
    /** Node ids currently attached (pending) to this thread's chat input. */
    chatNodeIds: ReadonlySet<string>;
    addToChat: (node: { nodeId: string; title: string }) => void;
} => {
    const dispatch = useAiAgentStoreDispatch();
    const threadNodes = useAiAgentStoreSelector(
        selectThreadComposerNodes(threadUuid),
    );
    const chatNodeIds = useMemo(
        () =>
            new Set(
                threadNodes
                    .filter(
                        (node) =>
                            node.artifactUuid === artifactUuid &&
                            node.versionUuid === versionUuid,
                    )
                    .map((node) => node.nodeId),
            ),
        [threadNodes, artifactUuid, versionUuid],
    );
    const addToChat = useCallback(
        ({ nodeId, title }: { nodeId: string; title: string }) => {
            dispatch(
                addThreadComposerNode({
                    threadUuid,
                    node: { artifactUuid, versionUuid, nodeId, title },
                }),
            );
        },
        [dispatch, threadUuid, artifactUuid, versionUuid],
    );
    return { chatNodeIds, addToChat };
};
