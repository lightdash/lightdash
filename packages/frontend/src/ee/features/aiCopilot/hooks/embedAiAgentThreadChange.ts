const AI_AGENT_THREAD_CHANGED_EVENT = 'lightdash:aiAgentThreadChanged';

type EmbedAiAgentThreadChange = {
    agentUuid: string;
    projectUuid: string;
    threadUuid: string;
};

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

export const emitEmbedAiAgentThreadChange = ({
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
