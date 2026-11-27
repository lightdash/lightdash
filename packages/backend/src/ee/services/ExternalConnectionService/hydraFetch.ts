import { type HydraApiSource } from '@lightdash/common';
import {
    hydraServer,
    HydraTimeoutError,
    type HydraServer,
} from '../../../services/QuerySourceService/live/integrations/hydra/server';
import {
    SecureFetchError,
    type SecureFetchResult,
} from '../../../utils/secureFetch/secureFetch';

/**
 * Answers a Hydra source's call in-process, in the shape the guarded fetch
 * returns, so everything around the fetch runs as it does for a real API.
 * A wait past the source's timeout fails the way a slow API would.
 */
export const fetchFromHydra = async ({
    connectionUuid,
    settings,
    secret,
    timeoutMs,
    request,
    server = hydraServer,
}: {
    connectionUuid: string;
    settings: HydraApiSource;
    secret: string | null;
    timeoutMs: number;
    request: { method: 'GET' | 'POST'; path: string; body?: unknown };
    server?: HydraServer;
}): Promise<SecureFetchResult> => {
    let response: Awaited<ReturnType<HydraServer['fetch']>>;
    try {
        response = await server.fetch({
            sourceKey: connectionUuid,
            settings,
            token: secret,
            timeoutMs,
            request: {
                method: request.method,
                path: request.path,
                body: request.body,
            },
        });
    } catch (error) {
        if (error instanceof HydraTimeoutError) {
            throw new SecureFetchError('timeout', error.message);
        }
        throw error;
    }
    return {
        status: response.status,
        contentType: 'application/json',
        headers: response.headers,
        bodyText: JSON.stringify(response.body),
        truncated: false,
    };
};

/**
 * Answers a Hydra token request in-process, in the shape the guarded fetch
 * returns, so the OAuth token client runs as it does for a real vendor.
 * Codes and tokens are bound to the source that asked for them.
 */
export const fetchHydraToken = async ({
    connectionUuid,
    settings,
    body,
    server = hydraServer,
}: {
    connectionUuid: string;
    settings: HydraApiSource;
    body: string | undefined;
    server?: HydraServer;
}): Promise<SecureFetchResult> => {
    const response = server.token({
        sourceKey: connectionUuid,
        settings,
        form: new URLSearchParams(body ?? ''),
    });
    return {
        status: response.status,
        contentType: 'application/json',
        headers: response.headers,
        bodyText: JSON.stringify(response.body),
        truncated: false,
    };
};
