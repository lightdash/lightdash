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
    LiveCatalog,
    LiveIntegration,
} from './types';

/**
 * Checks an integration against the contract. Its request type stays
 * inside it: everything outside sends the query text through `parseRequest`.
 */
export const defineLiveIntegration = <
    C extends ApiConnectorType,
    Request,
    Catalog extends LiveCatalog,
>(
    integration: LiveIntegration<C, Request, Catalog>,
): LiveIntegration<C> => integration as unknown as LiveIntegration<C>;

/**
 * A `describe` that adds discovered fields to the first explore and to
 * `models`, and keeps every other explore as written.
 */
export const describeExplores =
    <Catalog>(
        explores: readonly LiveExploreDefinition[],
        models: readonly string[],
        withFields: (
            definition: LiveExploreDefinition,
            catalog: Catalog,
        ) => LiveExploreDefinition,
    ) =>
    (catalog: Catalog): LiveExploreDefinition[] =>
        explores.map((definition, index) =>
            index === 0 || models.includes(definition.name)
                ? withFields(definition, catalog)
                : definition,
        );

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

/** Refuses a limit past what one query can read, for APIs that can't cap it. */
export const assertMaxRows = (limit: number, maxRows: number) => {
    if (limit > maxRows) {
        throw refuseLiveQuery(
            'live_source.refused.row_limit',
            `limit must be between 1 and ${maxRows} rows`,
        );
    }
};

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

export const getLiveAccessRules = <C extends ApiConnectorType>(
    integration: LiveIntegration<C>,
    settings: ApiSourceOf<C>,
): LiveAccessRules => {
    const access = integration.access(settings);
    const unique = <T>(values: T[]) => [...new Set(values)];
    return {
        allowedPathPrefixes: unique(access.rules.map(({ path }) => path)),
        allowedMethods: unique(access.rules.map(({ method }) => method)),
        allowedContentTypes: ['application/json'],
        timeoutMs: integration.limits.timeoutMs,
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
    integration.validate(apiSource);
    const { origins, acceptsOrigin, label } = integration;
    const trimmed = origin.replace(/\/+$/, '');
    const isAccepted = acceptsOrigin
        ? acceptsOrigin(trimmed)
        : origins.includes(trimmed);
    if (!isAccepted) {
        throw new ParameterError(
            `${label} connections must use ${origins.join(' or ')}`,
        );
    }
    integration.checkAuth({ type, origin, oauthTokenUrl });
};

/** A request a source may send to read data. */
export const readRule = (
    method: LiveAccessRule['method'],
    path: string,
): LiveAccessRule => ({ method, path, effect: 'read' });

/**
 * The rule that lets a source send `request`: same method, and a path that
 * is the rule's path or under it, segment by segment.
 */
export const findAccessRule = (
    rules: LiveAccessRule[],
    request: Pick<LiveAccessRule, 'method' | 'path'>,
): LiveAccessRule | undefined =>
    rules.find(
        ({ method, path }) =>
            method === request.method &&
            (request.path === path ||
                request.path.startsWith(
                    path.endsWith('/') ? path : `${path}/`,
                )),
    );
