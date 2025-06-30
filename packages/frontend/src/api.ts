import {
    LightdashRequestMethodHeader,
    LightdashVersionHeader,
    RequestMethod,
    type AnyType,
    type ApiError,
    type ApiResponse,
} from '@lightdash/common';
import { spanToTraceHeader, startSpan } from '@sentry/react';
import fetch from 'isomorphic-fetch';

// TODO: import from common or fix the instantiation of the request module
const LIGHTDASH_SDK_INSTANCE_URL_LOCAL_STORAGE_KEY =
    '__lightdash_sdk_instance_url';

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

type LightdashApiPropsBase = {
    url: string;
    headers?: Record<string, string> | undefined;
    version?: 'v1' | 'v2';
    signal?: AbortSignal;
};

type LightdashApiPropsGetOrDelete = LightdashApiPropsBase & {
    method: 'GET' | 'DELETE';
    body?: BodyInit | null | undefined;
};

type LightdashApiPropsWrite = LightdashApiPropsBase & {
    method: 'POST' | 'PATCH' | 'PUT';
    body: BodyInit | null | undefined;
};

type LightdashApiProps = LightdashApiPropsGetOrDelete | LightdashApiPropsWrite;

const MAX_NETWORK_HISTORY = 10;
export let networkHistory: AnyType[] = [];

export const lightdashApi = async <T extends ApiResponse['results']>({
    method,
    url,
    body,
    headers,
    version = 'v1',
    signal,
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
        signal,
    })
        .then((r) => {
            if (!r.ok) {
                return r.json().then((d) => {
                    throw d;
                });
            }
            return r;
        })
        .then(async (r) => {
            const js = await r.json();
            networkHistory.push({
                method,
                url,
                body,
                status: r.status,
                json: JSON.stringify(js).substring(0, 500),
            });
            return js;
        })
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
            // TODO do not capture some requests, like passwords or sensitive data
            networkHistory.push({
                method,
                status: err.status,
                url,
                body,
                error: JSON.stringify(err).substring(0, 500),
            });
            // only store last MAX_NETWORK_HISTORY requests
            if (networkHistory.length > MAX_NETWORK_HISTORY)
                networkHistory.shift();
            throw handleError(err);
        });
};

export const lightdashApiStream = ({
    method,
    url,
    body,
    headers,
    version = 'v1',
    signal,
}: LightdashApiProps) => {
    const baseUrl = sessionStorage.getItem(
        LIGHTDASH_SDK_INSTANCE_URL_LOCAL_STORAGE_KEY,
    );
    const apiPrefix = `${baseUrl ?? BASE_API_URL}api/${version}`;

    let sentryTrace: string | undefined;
    // Manually create a span for the fetch request to be able to trace it in Sentry. This also enables Distributed Tracing.
    startSpan(
        {
            op: 'http.client',
            name: `API Streaming Request: ${method} ${url}`,
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
        signal,
    })
        .then((r) => {
            if (!r.ok) {
                throw r;
            }
            return r;
        })
        .catch((err) => {
            throw handleError(err);
        });
};
