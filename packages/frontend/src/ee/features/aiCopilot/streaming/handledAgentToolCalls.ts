// Stream parts outlive mounts until reload, so handled ids are kept per consumer for the session.
const handledToolCallIdsByConsumer = new Map<string, Set<string>>();

export const getHandledAgentToolCallIds = (consumer: string): Set<string> => {
    const existing = handledToolCallIdsByConsumer.get(consumer);
    if (existing) return existing;
    const created = new Set<string>();
    handledToolCallIdsByConsumer.set(consumer, created);
    return created;
};

export const resetHandledAgentToolCallIds = () => {
    handledToolCallIdsByConsumer.clear();
};
