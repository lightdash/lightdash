import {
    ParameterError,
    type ApiConnectorType,
    type ApiSourceOf,
    type CreateExternalConnection,
    type ExternalConnectionAuthType,
} from '@lightdash/common';
import { type z } from 'zod';
import { type LiveExploreDefinition } from './explores/definition';
import { refuseLiveQuery } from './query/refuse';
import type {
    LiveAccessRule,
    LiveCapabilities,
    LiveIntegration,
    LiveLimits,
} from './types';

/**
 * Checks an integration against the contract. Its request type stays
 * inside it: everything outside sends the query text through `parseLiveRequest`.
 */
export const defineLiveIntegration = <C extends ApiConnectorType, Request>(
    integration: LiveIntegration<C, Request>,
): LiveIntegration<C> => integration as unknown as LiveIntegration<C>;

/**
 * Reads a JSON request checked by `schema`. `name` names it in errors, as
 * in "The GA4 report request must be a JSON object".
 */
export const jsonRequest =
    <Request>(name: string, schema: z.ZodType<Request>) =>
    (query: string): Request => {
        let json: unknown;
        try {
            json = JSON.parse(query);
        } catch {
            throw new ParameterError(
                `The ${name} request must be a JSON object`,
            );
        }
        const parsed = schema.safeParse(json);
        if (!parsed.success) {
            const [issue] = parsed.error.issues;
            throw new ParameterError(
                issue.path.length === 0 && issue.code === 'custom'
                    ? issue.message
                    : `Invalid ${name} request at ${
                          issue.path.join('.') || 'the top level'
                      }: ${issue.message}`,
            );
        }
        return parsed.data;
    };

/**
 * `merged` with each field `declared` lacks starting off when `isOff` says
 * so by its `apiName`: the vendor's own bookkeeping, which most people never
 * chart.
 */
export const withFieldsOffByDefault = <D extends LiveExploreDefinition>(
    declared: LiveExploreDefinition,
    merged: D,
    isOff: (apiName: string) => boolean,
): D => {
    const declaredNames = new Set(
        [...declared.dimensions, ...declared.metrics].map(({ name }) => name),
    );
    const mark = <F extends { name: string; apiName: string }>(field: F) =>
        !declaredNames.has(field.name) && isOff(field.apiName)
            ? { ...field, onByDefault: false }
            : field;
    return {
        ...merged,
        dimensions: merged.dimensions.map(mark),
        metrics: merged.metrics.map(mark),
    };
};

/** Refuses a limit past what one query can read, for APIs that can't cap it. */
export const assertMaxRows = (limit: number, maxRows: number) => {
    if (limit > maxRows) {
        throw refuseLiveQuery(
            'live_source.refused.row_limit',
            `limit must be between 1 and ${maxRows} rows`,
        );
    }
};

/**
 * A source's limits: its own when its settings set them, with
 * `callsPerQuery` filled in from the pages `maxRows` takes.
 */
export const getLiveLimits = <C extends ApiConnectorType>(
    integration: Pick<LiveIntegration<C>, 'query'>,
    settings?: ApiSourceOf<C>,
): LiveLimits & { callsPerQuery: number } => {
    const limits =
        settings && integration.query.limitsFor
            ? integration.query.limitsFor(settings)
            : integration.query.limits;
    return {
        ...limits,
        callsPerQuery:
            limits.callsPerQuery ??
            (limits.pageSize ? Math.ceil(limits.maxRows / limits.pageSize) : 1),
    };
};

/** Reads one query as compile writes it and as an agent may send it raw. */
export const parseLiveRequest = <C extends ApiConnectorType>(
    integration: Pick<LiveIntegration<C>, 'label' | 'query'>,
    query: string,
): unknown =>
    typeof integration.query.request === 'function'
        ? integration.query.request(query)
        : jsonRequest(integration.label, integration.query.request)(query);

/** Every feature the shared check gates, refused. */
export const ALL_PUSHDOWN_REFUSED: LiveCapabilities['pushdown'] = {
    tableCalculations: 'refused',
    customDimensions: 'refused',
    customMetrics: 'refused',
    pivots: 'refused',
    periodOverPeriod: 'refused',
    dateZoom: 'refused',
};

/** A count in a setup test summary, as in "1,204". */
export const formatTestCount = (count: number) =>
    new Intl.NumberFormat('en-US').format(count);

export const LIVE_RESPONSE_MAX_BYTES = 25 * 1024 * 1024;

/** What a source can reach, whatever its stored connection says. */
export type LiveAccessRules = Required<
    Pick<
        CreateExternalConnection,
        | 'allowedPathPrefixes'
        | 'allowedMethods'
        | 'allowedContentTypes'
        | 'timeoutMs'
        | 'responseMaxBytes'
    >
> &
    Pick<CreateExternalConnection, 'customHeaders'>;

/**
 * The fixed part of a rule's path, which covers every path it allows: up to
 * its first `{name}` segment.
 */
const getStaticPathPrefix = (path: string) => {
    const segments = path.split('/');
    const templated = segments.findIndex((segment) => /^\{.+\}$/.test(segment));
    return templated === -1
        ? path
        : segments.slice(0, templated).join('/') || '/';
};

/**
 * What a source can reach, as the connection stores it. The proxy checks a
 * live source's requests against its rules (`findAccessRule`); these lists
 * only cover them, a path prefix per rule.
 */
export const getLiveAccessRules = <C extends ApiConnectorType>(
    integration: LiveIntegration<C>,
    settings: ApiSourceOf<C>,
    explores: readonly LiveExploreDefinition[] = integration.model.explores,
): LiveAccessRules => {
    const access = integration.connection.access(settings, explores);
    const unique = <T>(values: T[]) => [...new Set(values)];
    return {
        allowedPathPrefixes: unique(
            access.rules.map(({ path }) => getStaticPathPrefix(path)),
        ),
        allowedMethods: unique(access.rules.map(({ method }) => method)),
        allowedContentTypes: ['application/json'],
        timeoutMs: integration.query.limits.timeoutMs,
        responseMaxBytes: LIVE_RESPONSE_MAX_BYTES,
        ...(access.headers !== undefined
            ? { customHeaders: access.headers }
            : {}),
    };
};

export type LiveConnectionSettings<
    C extends ApiConnectorType = ApiConnectorType,
> = {
    apiSource: ApiSourceOf<C>;
    type: ExternalConnectionAuthType;
    origin: string;
    oauthTokenUrl?: string | null;
};

/** Throws a ParameterError naming what the admin has to change. */
export const validateLiveConnection = <C extends ApiConnectorType>(
    integration: LiveIntegration<C>,
    { apiSource, type, origin, oauthTokenUrl }: LiveConnectionSettings<C>,
) => {
    integration.connection.validate?.(apiSource);
    const {
        connection: { origins, acceptsOrigin },
        label,
    } = integration;
    const trimmed = origin.replace(/\/+$/, '');
    const isAccepted = acceptsOrigin
        ? acceptsOrigin(trimmed)
        : origins.includes(trimmed);
    if (!isAccepted) {
        throw new ParameterError(
            `${label} connections must use ${origins.join(' or ')}`,
        );
    }
    integration.connection.checkAuth({ type, origin, oauthTokenUrl });
};

/**
 * A request a source may send to read data: `path` and the paths under it,
 * or only `path` itself when `exact`. A `{name}` segment matches any one
 * segment; `entry` names the explore model the rule serves.
 */
export const readRule = (
    method: LiveAccessRule['method'],
    path: string,
    { exact, entry }: { exact?: boolean; entry?: string } = {},
): LiveAccessRule => ({
    method,
    path,
    effect: 'read',
    ...(exact ? { exact: true } : {}),
    ...(entry !== undefined ? { entry } : {}),
});

const isTemplateSegment = (segment: string) => /^\{.+\}$/.test(segment);

/** Whether `path` is the rule's path, or under it unless the rule is exact. */
const matchesRulePath = (rule: LiveAccessRule, path: string): boolean => {
    if (!rule.exact && !rule.path.split('/').some(isTemplateSegment)) {
        return (
            path === rule.path ||
            path.startsWith(
                rule.path.endsWith('/') ? rule.path : `${rule.path}/`,
            )
        );
    }
    const ruleSegments = rule.path.replace(/\/+$/, '').split('/');
    const segments = path.split('/');
    const isTrailingSlashOnly =
        segments.length === ruleSegments.length + 1 && segments.at(-1) === '';
    if (
        segments.length < ruleSegments.length ||
        (rule.exact &&
            segments.length !== ruleSegments.length &&
            !isTrailingSlashOnly)
    ) {
        return false;
    }
    return ruleSegments.every((ruleSegment, index) =>
        isTemplateSegment(ruleSegment)
            ? segments[index] !== ''
            : segments[index] === ruleSegment,
    );
};

/**
 * The rule that lets a source send `request`: the same method, and a path
 * the rule allows (see `readRule`). The proxy refuses anything else.
 */
export const findAccessRule = (
    rules: LiveAccessRule[],
    request: Pick<LiveAccessRule, 'method' | 'path'>,
): LiveAccessRule | undefined =>
    rules.find(
        (rule) =>
            rule.method === request.method &&
            matchesRulePath(rule, request.path),
    );
