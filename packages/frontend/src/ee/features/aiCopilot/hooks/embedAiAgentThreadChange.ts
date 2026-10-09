import { useCallback } from 'react';
import { type EmbedAiAgentThreadChange } from '../../../providers/Embed/types';
import useEmbed from '../../../providers/Embed/useEmbed';

const AI_AGENT_THREAD_CHANGED_EVENT = 'lightdash:aiAgentThreadChanged';

const getTargetOrigin = () => {
    const targetOrigin = new URLSearchParams(window.location.search).get(
        'targetOrigin',
    );

    if (!targetOrigin) {
        return null;
    }

    try {
        return new URL(targetOrigin).origin;
    } catch {
        return null;
    }
};

const postEmbedAiAgentThreadChange = ({
    agentUuid,
    projectUuid,
    threadUuid,
}: EmbedAiAgentThreadChange) => {
    if (typeof window === 'undefined' || window.parent === window) {
        return;
    }

    const targetOrigin = getTargetOrigin();
    if (!targetOrigin) {
        return;
    }

    window.parent.postMessage(
        {
            type: AI_AGENT_THREAD_CHANGED_EVENT,
            payload: {
                agentUuid,
                projectUuid,
                threadUuid,
            },
            timestamp: Date.now(),
        },
        targetOrigin,
    );
};

export const useEmitEmbedAiAgentThreadChange = () => {
    const { onAiAgentThreadChange } = useEmbed();
    return useCallback(
        (change: EmbedAiAgentThreadChange) =>
            onAiAgentThreadChange
                ? onAiAgentThreadChange(change)
                : postEmbedAiAgentThreadChange(change),
        [onAiAgentThreadChange],
    );
};
