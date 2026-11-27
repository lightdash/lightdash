import type { ApiConnectorType, ApiSourceOf } from '@lightdash/common';
import { createLiveRuntime, type LiveTransport } from './calls';
import { runLiveRequest } from './query/run';
import type { LiveCatalog, LiveIntegration } from './types';

/** One integration over a fake transport, the way the service runs it. */
export const connectLiveSource = <C extends ApiConnectorType>(
    integration: LiveIntegration<C>,
    settings: ApiSourceOf<C>,
    transport: LiveTransport,
) => {
    const source = {
        integration: integration as unknown as LiveIntegration,
        settings,
        runtime: createLiveRuntime(
            integration as unknown as LiveIntegration,
            settings,
            transport,
        ),
    };
    return {
        run: (args: { query: string; limit: number }) =>
            runLiveRequest(source, args),
        discover: (): Promise<LiveCatalog> =>
            integration.discovery?.discover({
                settings,
                runtime: source.runtime,
            }) ?? Promise.resolve({}),
    };
};
