const AI_AGENT_STREAM_INACTIVITY_TIMEOUT_MS = 30_000;

export const createStreamInactivityMonitor = ({
    onInactive,
    timeoutMs = AI_AGENT_STREAM_INACTIVITY_TIMEOUT_MS,
}: {
    onInactive: () => void;
    timeoutMs?: number;
}) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const stop = () => {
        if (timeout !== null) {
            clearTimeout(timeout);
            timeout = null;
        }
    };

    const reset = () => {
        stop();
        timeout = setTimeout(() => {
            timeout = null;
            onInactive();
        }, timeoutMs);
    };

    reset();

    return { reset, stop };
};
