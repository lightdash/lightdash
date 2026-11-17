import type { ApiConnectorType, ApiSourceOf } from '@lightdash/common';
import { createLiveCalls, type LiveTransport } from './calls';
import { runLiveRequest } from './query/run';
import type { LiveIntegration, LiveScanResult } from './types';

/** One integration over a fake transport, the way the service runs it. */
export const connectLiveSource = <C extends ApiConnectorType>(
    integration: LiveIntegration<C>,
    settings: ApiSourceOf<C>,
    transport: LiveTransport,
) => {
    const source = {
        integration: integration as unknown as LiveIntegration,
        settings,
        calls: createLiveCalls(
            integration as unknown as LiveIntegration,
            settings,
            transport,
        ),
    };
    return {
        run: (args: { query: string; limit: number }) =>
            runLiveRequest(source, args),
        scan: (): Promise<LiveScanResult> =>
            integration.scan?.read({ settings, calls: source.calls }) ??
            Promise.resolve({}),
    };
};
