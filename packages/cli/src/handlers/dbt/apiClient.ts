import { ApiError, ApiResponse } from '@lightdash/common';
import fetch, { BodyInit } from 'node-fetch';
import { URL } from 'url';
import { getConfig } from '../../config';

const handleError = (err: any): ApiError => {
    if (err.error?.statusCode && err.error?.name) return err;
    return {
        status: 'error',
        error: {
            name: 'NetworkError',
            statusCode: 500,
            message: `Could not connect to Lightdash server. The server may have crashed or be running on an incorrect host and port configuration.`,
            data: err,
        },
    };
};

type LightdashApiProps = {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
    url: string;
    body: BodyInit | undefined;
};
export const lightdashApi = async <T extends ApiResponse['results']>({
    method,
    url,
    body,
}: LightdashApiProps): Promise<T> => {
    const config = await getConfig();
    const headers = {
        'Content-Type': 'application/json',
        Cookie: `connect.sid=${config.context.apiKey}`,
    };
    const fullUrl = new URL(url, config.context.serverUrl).href;
    return fetch(fullUrl, { method, headers, body })
        .then((r) => {
            if (!r.ok)
                return r.json().then((d) => {
                    throw d;
                });
            return r;
        })
        .then((r) => r.json())
        .then((d: ApiResponse | ApiError) => {
            switch (d.status) {
                case 'ok':
                    return d.results as T;
                case 'error':
                    // eslint-disable-next-line @typescript-eslint/no-throw-literal
                    throw d;
                default:
                    // eslint-disable-next-line @typescript-eslint/no-throw-literal
                    throw d;
            }
        })
        .catch((err) => {
            // eslint-disable-next-line @typescript-eslint/no-throw-literal
            throw handleError(err);
        });
};
