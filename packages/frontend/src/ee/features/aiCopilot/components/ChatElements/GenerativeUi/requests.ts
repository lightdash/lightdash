import {
    assertUnreachable,
    type GenerativeUiCompiledRequest,
    type GenerativeUiHttpMethod,
} from '@lightdash/common';
import { lightdashApi } from '../../../../../../api';
import { resolveValue, type GenerativeUiBindingContext } from './bindings';

export type GenerativeUiRequest = {
    method: GenerativeUiHttpMethod;
    version: 'v1' | 'v2';
    url: string;
    body: string | undefined;
};

export type GenerativeUiFetcher = (
    request: GenerativeUiRequest,
) => Promise<unknown>;

export type GenerativeUiRequestBuild =
    | { ok: true; request: GenerativeUiRequest }
    | { ok: false; message: string };

const PATH_PARAM = /\{([^}]+)\}/g;

const splitApiPath = (
    pathTemplate: string,
): { version: 'v1' | 'v2'; path: string } | null => {
    if (pathTemplate.startsWith('/api/v1/')) {
        return { version: 'v1', path: pathTemplate.slice('/api/v1'.length) };
    }
    if (pathTemplate.startsWith('/api/v2/')) {
        return { version: 'v2', path: pathTemplate.slice('/api/v2'.length) };
    }
    return null;
};

const pathSegmentOf = (value: unknown): string | null => {
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string' && value !== '') return value;
    return null;
};

/** Resolves a compiled request's params into the call lightdashApi makes. */
export const buildGenerativeUiRequest = (
    { operation, params }: GenerativeUiCompiledRequest,
    context: GenerativeUiBindingContext,
): GenerativeUiRequestBuild => {
    const apiPath = splitApiPath(operation.pathTemplate);
    if (apiPath === null) {
        return {
            ok: false,
            message: `${operation.operationId} is not under /api/v1 or /api/v2`,
        };
    }

    const segments = new Map<string, string>();
    const names = Array.from(apiPath.path.matchAll(PATH_PARAM), (m) => m[1]);
    for (const name of names) {
        const param = params.path[name];
        const segment = pathSegmentOf(
            param === undefined ? undefined : resolveValue(param, context),
        );
        if (segment === null) {
            return {
                ok: false,
                message: `Path parameter "${name}" has no value`,
            };
        }
        segments.set(name, encodeURIComponent(segment));
    }

    const search = new URLSearchParams();
    for (const [name, param] of Object.entries(params.query)) {
        const resolved = resolveValue(param, context);
        const values: unknown[] = Array.isArray(resolved)
            ? resolved
            : [resolved];
        for (const value of values) {
            if (value === undefined || value === null) continue;
            if (
                typeof value !== 'string' &&
                typeof value !== 'number' &&
                typeof value !== 'boolean'
            ) {
                return {
                    ok: false,
                    message: `Query parameter "${name}" must be a string, number or boolean`,
                };
            }
            search.append(name, String(value));
        }
    }

    const path = apiPath.path.replace(
        PATH_PARAM,
        (_match, name: string) => segments.get(name) ?? '',
    );
    const query = search.toString();
    return {
        ok: true,
        request: {
            method: operation.method,
            version: apiPath.version,
            url: query === '' ? path : `${path}?${query}`,
            body:
                params.body === undefined
                    ? undefined
                    : JSON.stringify(resolveValue(params.body, context)),
        },
    };
};

/** Sends a request as the signed-in user; resolves with the response `results`. */
export const lightdashApiFetcher: GenerativeUiFetcher = ({
    method,
    version,
    url,
    body,
}) => {
    switch (method) {
        case 'GET':
            return lightdashApi({ method, version, url, body: undefined });
        case 'DELETE':
        case 'POST':
        case 'PATCH':
        case 'PUT':
            return lightdashApi({ method, version, url, body });
        default:
            return assertUnreachable(method, 'Unknown HTTP method');
    }
};
