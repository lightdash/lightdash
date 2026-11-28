import {
    ApiConnectorType,
    HYDRA_ORIGIN,
    SEED_PROJECT,
    type ApiExecuteAsyncMetricQueryResults,
    type CreateExternalConnection,
    type ExternalConnection,
    type HydraApiSource,
    type ResultsCacheProjectSettings,
} from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, type Body } from '../helpers/api-client';
import { login } from '../helpers/auth';
import { pollUntil } from '../helpers/polling';

// Hydra is an integration with seeded data and no vendor behind it, so
// these tests reach the live data source engine without any outside call.

const projectUuid = SEED_PROJECT.project_uuid;
const connectionsUrl = `/api/v1/ee/projects/${projectUuid}/external-connections`;
const metricQueryUrl = `/api/v2/projects/${projectUuid}/query/metric-query`;
const cacheSettingsUrl = `/api/v1/projects/${projectUuid}/results-cache-config`;

const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000)}`;

type QueryOutcome = {
    status: 'ready' | 'error' | 'refused';
    cacheHit: boolean;
    rows: Record<string, unknown>[];
    error: string | null;
};

type HydraSettingsInput = Omit<HydraApiSource, 'connector'>;

/** A Hydra source's settings; any left out take their defaults. */
const hydra = (settings: HydraSettingsInput = {}): HydraApiSource => ({
    connector: ApiConnectorType.HYDRA,
    ...settings,
});

const hydraSourceBody = (
    name: string,
    token: string,
    settings: HydraSettingsInput = {},
): CreateExternalConnection => ({
    name: `Hydra ${name} ${runId}`,
    type: 'bearer_token',
    origin: HYDRA_ORIGIN,
    secret: token,
    apiSource: hydra(settings),
    allowedMethods: ['GET'],
    allowedPathPrefixes: [],
    allowedContentTypes: ['application/json'],
    explorePrefix: `hydra_${name}_${runId}`,
});

const createHydraSource = async (
    admin: ApiClient,
    name: string,
    token: string,
    settings: HydraSettingsInput = {},
) => {
    const resp = await admin.post<Body<ExternalConnection>>(
        connectionsUrl,
        hydraSourceBody(name, token, settings),
    );
    expect(resp.status).toBe(201);
    const prefix = `hydra_${name}_${runId}`;
    return {
        uuid: resp.body.results.externalConnectionUuid,
        events: `${prefix}_events`,
        users: `${prefix}_users`,
    };
};

const runQuery = async (
    admin: ApiClient,
    exploreName: string,
    {
        dimensions = [],
        metrics = [`${exploreName}_event_count`],
        limit = 100,
        invalidateCache = false,
    }: {
        dimensions?: string[];
        metrics?: string[];
        limit?: number;
        invalidateCache?: boolean;
    } = {},
): Promise<QueryOutcome> => {
    const resp = await admin.post<
        Body<ApiExecuteAsyncMetricQueryResults> & {
            error?: { message: string };
        }
    >(
        metricQueryUrl,
        {
            context: 'exploreView',
            invalidateCache,
            query: {
                exploreName,
                dimensions,
                metrics,
                filters: {},
                sorts: [],
                limit,
                tableCalculations: [],
                customDimensions: [],
                additionalMetrics: [],
            },
        },
        { failOnStatusCode: false },
    );
    if (resp.status !== 200) {
        return {
            status: 'refused',
            cacheHit: false,
            rows: [],
            error: resp.body.error?.message ?? `HTTP ${resp.status}`,
        };
    }
    const { queryUuid, cacheMetadata } = resp.body.results;
    const done = await pollUntil<
        Body<{
            status: string;
            error?: string | null;
            rows?: Record<string, { value: { raw: unknown } }>[];
        }>
    >(admin, `/api/v2/projects/${projectUuid}/query/${queryUuid}`, {
        timeout: 60_000,
        condition: (body) =>
            body.results.status === 'ready' || body.results.status === 'error',
    });
    return {
        status: done.results.status === 'ready' ? 'ready' : 'error',
        cacheHit: cacheMetadata.cacheHit,
        rows: (done.results.rows ?? []).map((row) =>
            Object.fromEntries(
                Object.entries(row).map(([key, cell]) => [key, cell.value.raw]),
            ),
        ),
        error: done.results.error ?? null,
    };
};

describe('Hydra, the integration with seeded data', () => {
    let admin: ApiClient;
    let source: Awaited<ReturnType<typeof createHydraSource>>;
    const created: string[] = [];
    let restoreCache: boolean | null = null;

    beforeAll(async () => {
        admin = await login();
        // Live results follow the project's result caching
        const cache =
            await admin.get<Body<ResultsCacheProjectSettings>>(
                cacheSettingsUrl,
            );
        if (!cache.body.results.cacheEnabled) {
            restoreCache = false;
            await admin.patch(cacheSettingsUrl, { cacheEnabled: true });
        }

        source = await createHydraSource(admin, 'main', 'alice', {
            rowCount: 400,
        });
        created.push(source.uuid);
    });

    afterAll(async () => {
        await Promise.all(
            created.map((uuid) =>
                admin.delete(`${connectionsUrl}/${uuid}`, {
                    failOnStatusCode: false,
                }),
            ),
        );
        if (restoreCache !== null) {
            await admin.patch(cacheSettingsUrl, { cacheEnabled: restoreCache });
        }
    });

    it('answers a chart query, then reuses its results for the same query', async () => {
        const query = {
            dimensions: [`${source.events}_event_type`],
            // Unique per run so earlier runs leave nothing cached
            limit: 100 + Math.floor(Math.random() * 300),
        };
        const first = await runQuery(admin, source.events, query);
        expect(first).toMatchObject({ status: 'ready', cacheHit: false });
        expect(first.rows.length).toBeGreaterThan(0);

        const repeat = await runQuery(admin, source.events, query);
        expect(repeat).toMatchObject({ status: 'ready', cacheHit: true });
        expect(repeat.rows).toEqual(first.rows);
    });

    it('joins a second explore, users, read the same way', async () => {
        const result = await runQuery(admin, source.users, {
            dimensions: [`${source.users}_plan`],
            metrics: [`${source.users}_user_count`, `${source.users}_seats`],
            invalidateCache: true,
        });
        expect(result.status).toBe('ready');
        expect(
            result.rows.reduce(
                (sum, row) => sum + Number(row[`${source.users}_user_count`]),
                0,
            ),
        ).toBe(40);
    });

    it('refuses a query past its row cap', async () => {
        const result = await runQuery(admin, source.events, {
            dimensions: [`${source.events}_user_id`],
            limit: 501,
            invalidateCache: true,
        });
        expect(result.status).not.toBe('ready');
        expect(result.error).toMatch(/500 rows/);
    });

    it('refuses out-of-range settings with a 400, on create and on update', async () => {
        const invalid = { rowCount: -1 };
        const message =
            'The Hydra setting rowCount must be a whole number from 0 to 100000';
        const createResp = await admin.post<{ error: { message: string } }>(
            connectionsUrl,
            hydraSourceBody('invalid', 'dave', invalid),
            { failOnStatusCode: false },
        );
        expect(createResp.status).toBe(400);
        expect(createResp.body.error.message).toBe(message);

        const updated = await admin.patch<{ error: { message: string } }>(
            `${connectionsUrl}/${source.uuid}`,
            { apiSource: hydra(invalid) },
            { failOnStatusCode: false },
        );
        expect(updated.status).toBe(400);
        expect(updated.body.error.message).toBe(message);
    });
});
