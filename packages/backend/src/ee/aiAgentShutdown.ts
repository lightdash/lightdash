import type { ServiceRepository } from '../services/ServiceRepository';

type StreamShutdownService = {
    failInFlightStreamedPrompts: () => Promise<void>;
};

export const failInFlightAiAgentStreams = async (
    repository: Pick<ServiceRepository, 'getInitializedAiAgentService'>,
): Promise<void> => {
    await repository
        .getInitializedAiAgentService<StreamShutdownService>()
        ?.failInFlightStreamedPrompts();
};
