import { type HydraApiSource } from '@lightdash/common';
import {
    hydraServer,
    type HydraServer,
} from '../../../services/QuerySourceService/live/integrations/hydra/server';
import {
    SecureFetchError,
    type SecureFetchResult,
} from '../../../utils/secureFetch/secureFetch';

/**
 * Answers a Hydra source's call in-process, in the shape the guarded fetch
 * returns, so everything around the fetch runs as it does for a real API.
 * A latency past the source's timeout fails the way a slow API would.
 */
export const fetchFromHydra = async ({
    connectionUuid,
    settings,
    secret,
    timeoutMs,
    request,
    server = hydraServer,
    sleep = (ms) =>
        new Promise((resolve) => {
            setTimeout(resolve, ms);
        }),
}: {
    connectionUuid: string;
    settings: HydraApiSource;
    secret: string | null;
    timeoutMs: number;
    request: { method: 'GET' | 'POST'; path: string; body?: unknown };
    server?: HydraServer;
    sleep?: (ms: number) => Promise<void>;
}): Promise<SecureFetchResult> => {
    if (settings.latencyMs >= timeoutMs) {
        await sleep(timeoutMs);
        throw new SecureFetchError(
            'timeout',
            `Hydra did not answer within ${timeoutMs}ms`,
        );
    }
    const response = await server.fetch({
        sourceKey: connectionUuid,
        settings,
        token: secret,
        request: {
            method: request.method,
            path: request.path,
            body: request.body,
        },
    });
    return {
        status: response.status,
        contentType: 'application/json',
        headers: response.headers,
        bodyText: JSON.stringify(response.body),
        truncated: false,
    };
};
