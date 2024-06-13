import {
    LightdashRequestMethodHeader,
    RequestMethod,
    type ApiError,
    type ApiResponse,
} from '@lightdash/common';
import * as Sentry from '@sentry/react';
import fetch from 'isomorphic-fetch';

export const BASE_API_URL =
    import.meta.env.VITEST === 'true'
        ? `http://test.lightdash/`
        : import.meta.env.BASE_URL;

const apiPrefix = `${BASE_API_URL}api/v1`;

const defaultHeaders = {
    'Content-Type': 'application/json',
    [LightdashRequestMethodHeader]: RequestMethod.WEB_APP,
};

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
    body: BodyInit | null | undefined;
    headers?: Record<string, string> | undefined;
};
export const lightdashApi = async <T extends ApiResponse['results']>({
    method,
    url,
    body,
    headers,
}: LightdashApiProps): Promise<T> => {
    const activeSpan = Sentry.getActiveSpan();
    const rootSpan = activeSpan ? Sentry.getRootSpan(activeSpan) : undefined;

    const sentryTraceHeader = rootSpan
        ? Sentry.spanToTraceHeader(rootSpan)
        : undefined;

    const sentryBaggageHeader = rootSpan
        ? Sentry.spanToBaggageHeader(rootSpan)
        : undefined;

    return fetch(`${apiPrefix}${url}`, {
        method,
        headers: {
            ...defaultHeaders,
            ...headers,
            ...(sentryBaggageHeader && { baggage: sentryBaggageHeader }),
            ...(sentryTraceHeader && { 'sentry-trace': sentryTraceHeader }),
        },
        body,
    })
        .then((r) => {
            if (!r.ok) {
                return r.json().then((d) => {
                    throw d;
                });
            }
            return r;
        })
        .then((r) => r.json())
        .then((d: ApiResponse | ApiError) => {
            switch (d.status) {
                case 'ok':
                    // make sure we return null instead of undefined
                    // otherwise react-query will crash
                    return (d.results ?? null) as T;
                case 'error':
                    throw d;
                default:
                    throw d;
            }
        })
        .catch((err) => {
            throw handleError(err);
        });
};
