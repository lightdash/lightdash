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
            message:
                'We are currently unable to reach the Lightdash server. Please try again in a few moments.',
            data: err,
        },
    };
};

type LightdashApiProps = {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
    url: string;
    body: BodyInit | null | undefined;
    headers?: Record<string, string> | undefined;
    version?: 'v1' | 'v2';
};
export const lightdashApi = async <T extends ApiResponse['results']>({
    method,
    url,
    body,
    headers,
    version = 'v1',
}: LightdashApiProps): Promise<T> => {
    const apiPrefix = `${BASE_API_URL}api/${version}`;

    let sentryTrace: string | undefined;
    // Manually create a span for the fetch request to be able to trace it in Sentry. This also enables Distributed Tracing.
    Sentry.startSpan(
        {
            op: 'http.client',
            name: `API Request: ${method} ${url}`,
            attributes: {
                'http.method': method,
                'http.url': url,
                type: 'fetch',
                url,
                method,
            },
        },
        (s) => {
            sentryTrace = Sentry.spanToTraceHeader(s);
        },
    );

    return fetch(`${apiPrefix}${url}`, {
        method,
        headers: {
            ...defaultHeaders,
            ...headers,
            ...(sentryTrace ? { 'sentry-trace': sentryTrace } : {}),
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
