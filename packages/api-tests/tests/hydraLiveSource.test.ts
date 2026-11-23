import {
    ApiConnectorType,
    FeatureFlags,
    HYDRA_ACCOUNT_PATH,
    HYDRA_ORIGIN,
    HYDRA_REPORT_PATH,
    SEED_PROJECT,
    type ApiExecuteAsyncMetricQueryResults,
    type CreateExternalConnection,
    type ExternalConnection,
    type ExternalConnectionApiUsage,
    type HealthState,
    type HydraApiSource,
    type ResultsCacheProjectSettings,
} from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, type Body } from '../helpers/api-client';
import { login } from '../helpers/auth';
import { pollUntil } from '../helpers/polling';

// Hydra is the test integration the shared live data source engine is
// tested through: its API answers in-process, from rows seeded by the
// sign-in token, and its settings make it slow, fail, page or rate limit.
// Hydra counts calls per backend process, so these tests check what queries
// return, not Hydra's call counts; a new source starts at call 1.

const projectUuid = SEED_PROJECT.project_uuid;
const connectionsUrl = `/api/v1/ee/projects/${projectUuid}/external-connections`;
const metricQueryUrl = `/api/v2/projects/${projectUuid}/query/metric-query`;
const cacheSettingsUrl = `/api/v1/projects/${projectUuid}/results-cache-config`;
const flagUrl = `/api/v2/feature-flag/${FeatureFlags.ApiQuerySources}`;

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

/** The calls Lightdash sent a source, retries included, across logged queries. */
const getApiCalls = async (admin: ApiClient, connectionUuid: string) => {
    const resp = await admin.get<Body<ExternalConnectionApiUsage[]>>(
        `${connectionsUrl}/api-usage`,
    );
    return (
        resp.body.results.find(
            (usage) => usage.externalConnectionUuid === connectionUuid,
        )?.apiCalls ?? 0
    );
};

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
    allowedMethods: ['GET', 'POST'],
    allowedPathPrefixes: [HYDRA_REPORT_PATH, HYDRA_ACCOUNT_PATH],
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

describe('Hydra, the test integration', () => {
    let admin: ApiClient;
    let source: Awaited<ReturnType<typeof createHydraSource>>;
    const created: string[] = [];
    let clearFlag = false;
    let restoreCache: boolean | null = null;

    const setBehaviour = async (settings: HydraSettingsInput) => {
        const resp = await admin.patch(`${connectionsUrl}/${source.uuid}`, {
            apiSource: hydra(settings),
        });
        expect(resp.status).toBe(200);
    };

    beforeAll(async () => {
        admin = await login();
        const health =
            await admin.get<
                Body<HealthState & { hasHydraLiveSource: boolean }>
            >('/api/v1/health');
        // Rainbow Machine envs turn Hydra on in rainbow.toml
        expect(health.body.results.hasHydraLiveSource).toBe(true);

        const flag = await admin.get<Body<{ enabled: boolean }>>(flagUrl);
        if (!flag.body.results.enabled) {
            expect((await admin.post(flagUrl, { enabled: true })).status).toBe(
                200,
            );
            clearFlag = true;
        }
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
        if (clearFlag) await admin.delete(flagUrl);
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

    // Needs lightdash/lightdash#33244 (SPK-3190): on main, identical queries
    // sent at once each call the integration while the first is running.
    it.skip('shares one integration call across identical queries sent at once', async () => {
        await setBehaviour({ latencyMs: 2_000 });
        const query = {
            dimensions: [`${source.events}_country`],
            limit: 400 + Math.floor(Math.random() * 99),
        };
        const results = await Promise.all(
            Array.from({ length: 4 }, () =>
                runQuery(admin, source.events, query),
            ),
        );
        expect(results.every(({ status }) => status === 'ready')).toBe(true);
        expect(results.filter(({ cacheHit }) => cacheHit)).toHaveLength(3);
        await setBehaviour({});
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

    it('gives each sign-in token its own rows', async () => {
        const other = await createHydraSource(admin, 'bob', 'bob', {
            rowCount: 400,
        });
        created.push(other.uuid);
        const totals = async (explore: string) =>
            (
                await runQuery(admin, explore, {
                    dimensions: [`${explore}_event_type`],
                    metrics: [`${explore}_event_count`, `${explore}_revenue`],
                    invalidateCache: true,
                })
            ).rows.map((row) => Object.values(row));
        expect(await totals(other.events)).not.toEqual(
            await totals(source.events),
        );
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

    it('explains a failed sign-in', async () => {
        await setBehaviour({ failAuth: true });
        try {
            const result = await runQuery(admin, source.events, {
                invalidateCache: true,
            });
            expect(result.status).toBe('error');
            expect(result.error).toMatch(/Hydra rejected the sign-in token/);
        } finally {
            await setBehaviour({});
        }
    });

    it('refuses out-of-range settings with a 400, on create and on update', async () => {
        const invalid = { latencyMs: -1 };
        const message =
            'The Hydra setting latencyMs must be a whole number from 0 to 120000';
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

    // Each test below uses a new source, so its calls count from 1 and
    // its API calls are its own

    it.each([
        ['a 429 with Retry-After', { status: 429, retryAfterSeconds: 2 }],
        [
            'a 403 whose body says it is a throttle',
            {
                status: 403,
                retryAfterSeconds: 1,
                body: { code: 'rate_limited', message: 'Slow down' },
            },
        ],
    ])('waits out %s and retries the call', async (_name, mock) => {
        const limited = await createHydraSource(
            admin,
            `retry${mock.status}`,
            'erin',
            { mockResponses: [{ call: 1, ...mock }] },
        );
        created.push(limited.uuid);
        const result = await runQuery(admin, limited.events, {
            invalidateCache: true,
        });
        expect(result.status).toBe('ready');
        // The refused call, then the retry
        expect(await getApiCalls(admin, limited.uuid)).toBe(2);
    });

    it('gives up after its retries while Hydra keeps refusing', async () => {
        const limited = await createHydraSource(admin, 'refusing', 'frank', {
            mockResponses: [{ fromCall: 1, status: 429, retryAfterSeconds: 1 }],
        });
        created.push(limited.uuid);
        const result = await runQuery(admin, limited.events, {
            invalidateCache: true,
        });
        expect(result.status).not.toBe('ready');
        expect(result.error).toMatch(/Hydra rate limit reached/);
        // The first call and two retries
        expect(await getApiCalls(admin, limited.uuid)).toBe(3);
    });

    it("shows the vendor's refusal when Lightdash declares no limits to hold", async () => {
        const limited = await createHydraSource(admin, 'undeclared', 'grace', {
            vendorLimits: {
                concurrentCalls: null,
                callsPerSecond: null,
                buckets: [{ id: 'hour', windowMs: 3_600_000, capacity: 1 }],
            },
            declaredLimits: null,
        });
        created.push(limited.uuid);
        const first = await runQuery(admin, limited.events, {
            invalidateCache: true,
        });
        expect(first.status).toBe('ready');
        const second = await runQuery(admin, limited.events, {
            invalidateCache: true,
        });
        expect(second.status).not.toBe('ready');
        expect(second.error).toMatch(/Hydra rate limit reached/);
        // Nothing declared holds, so the refusal is not retried
        expect(await getApiCalls(admin, limited.uuid)).toBe(2);
    });

    it('keeps calls under declared limits a little stricter than the vendor, so it never refuses', async () => {
        // The gate's window opens when it charges a call, a moment before the
        // call reaches Hydra, so the declared window keeps a margin
        const limited = await createHydraSource(admin, 'paced', 'heidi', {
            vendorLimits: {
                concurrentCalls: 1,
                callsPerSecond: null,
                buckets: [{ id: 'burst', windowMs: 2_500, capacity: 1 }],
            },
            declaredLimits: {
                concurrentCalls: 1,
                callsPerSecond: null,
                buckets: [{ id: 'burst', windowMs: 3_000, capacity: 1 }],
            },
        });
        created.push(limited.uuid);
        const startedAt = Date.now();
        const results = await Promise.all(
            [0, 1].map(() =>
                runQuery(admin, limited.events, { invalidateCache: true }),
            ),
        );
        expect(results.map(({ status }) => status)).toEqual(['ready', 'ready']);
        // The gate held the second call for the window instead of sending it
        expect(Date.now() - startedAt).toBeGreaterThanOrEqual(2_500);
        expect(await getApiCalls(admin, limited.uuid)).toBe(2);
    });

    it('reads a big report a page at a time', async () => {
        // 1,000 events seed 100 users, enough for 61 rows
        const paged = await createHydraSource(admin, 'paged', 'alice', {
            pageSize: 20,
        });
        created.push(paged.uuid);
        const result = await runQuery(admin, paged.events, {
            dimensions: [`${paged.events}_user_id`],
            limit: 60,
            invalidateCache: true,
        });
        expect(result.status).toBe('ready');
        expect(result.rows).toHaveLength(60);
        // 61 rows asked for, 20 a page
        expect(await getApiCalls(admin, paged.uuid)).toBe(4);
    });
});
