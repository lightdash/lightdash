import {
    LightdashRequestMethodHeader,
    LightdashVersionHeader,
    RequestMethod,
    type ApiError,
    type ApiResponse,
} from '@lightdash/common';
import { spanToTraceHeader, startSpan } from '@sentry/react';
import fetch from 'isomorphic-fetch';
import { LIGHTDASH_SDK_INSTANCE_URL_LOCAL_STORAGE_KEY } from './sdk';

export const BASE_API_URL =
    import.meta.env.VITEST === 'true'
        ? `http://test.lightdash/`
        : import.meta.env.BASE_URL;

const defaultHeaders = {
    'Content-Type': 'application/json',
    [LightdashRequestMethodHeader]: RequestMethod.WEB_APP,
    [LightdashVersionHeader]: __APP_VERSION__,
};

const handleError = (err: any): ApiError => {
    if (err.error?.statusCode && err.error?.name) {
        if (
            err.error?.name === 'DeactivatedAccountError' &&
            window.location.pathname !== '/login'
        ) {
            // redirect to login page when account is deactivated
            window.location.href = '/login';
        }
        return err;
    }
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
    const baseUrl = sessionStorage.getItem(
        LIGHTDASH_SDK_INSTANCE_URL_LOCAL_STORAGE_KEY,
    );
    const apiPrefix = `${baseUrl ?? BASE_API_URL}api/${version}`;

    let sentryTrace: string | undefined;
    // Manually create a span for the fetch request to be able to trace it in Sentry. This also enables Distributed Tracing.
    startSpan(
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
            sentryTrace = spanToTraceHeader(s);
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
