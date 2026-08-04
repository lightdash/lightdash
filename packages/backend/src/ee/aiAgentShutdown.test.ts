import { failInFlightAiAgentStreams } from './aiAgentShutdown';

describe('failInFlightAiAgentStreams', () => {
    it('shuts down an initialized AI agent service', async () => {
        const failInFlightStreamedPrompts = vi
            .fn()
            .mockResolvedValue(undefined);
        const getInitializedAiAgentService = vi.fn().mockReturnValue({
            failInFlightStreamedPrompts,
        });

        await failInFlightAiAgentStreams({
            getInitializedAiAgentService,
        } as never);

        expect(getInitializedAiAgentService).toHaveBeenCalledOnce();
        expect(failInFlightStreamedPrompts).toHaveBeenCalledOnce();
    });

    it('does not construct an unused AI agent service during shutdown', async () => {
        const getInitializedAiAgentService = vi.fn().mockReturnValue(undefined);

        await failInFlightAiAgentStreams({
            getInitializedAiAgentService,
        } as never);

        expect(getInitializedAiAgentService).toHaveBeenCalledOnce();
    });
});
