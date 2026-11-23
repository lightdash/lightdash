import {
    FeatureFlags,
    HYDRA_ACCOUNT_PATH,
    HYDRA_DEFAULT_SETTINGS,
    HYDRA_ORIGIN,
    HYDRA_REPORT_PATH,
    SEED_PROJECT,
    type ApiExecuteAsyncMetricQueryResults,
    type CreateExternalConnection,
    type ExternalConnection,
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
// sign-in token, and its settings make it slow, fail or rate limit.

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

const hydraSourceBody = (
    name: string,
    token: string,
    settings: Partial<HydraApiSource> = {},
): CreateExternalConnection => ({
    name: `Hydra ${name} ${runId}`,
    type: 'bearer_token',
    origin: HYDRA_ORIGIN,
    secret: token,
    apiSource: { ...HYDRA_DEFAULT_SETTINGS, ...settings },
    allowedMethods: ['GET', 'POST'],
    allowedPathPrefixes: [HYDRA_REPORT_PATH, HYDRA_ACCOUNT_PATH],
    allowedContentTypes: ['application/json'],
    explorePrefix: `hydra_${name}_${runId}`,
});

const createHydraSource = async (
    admin: ApiClient,
    name: string,
    token: string,
    settings: Partial<HydraApiSource> = {},
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

    const setBehaviour = async (settings: Partial<HydraApiSource>) => {
        const resp = await admin.patch(`${connectionsUrl}/${source.uuid}`, {
            apiSource: { ...HYDRA_DEFAULT_SETTINGS, ...settings },
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
            { apiSource: { ...HYDRA_DEFAULT_SETTINGS, ...invalid } },
            { failOnStatusCode: false },
        );
        expect(updated.status).toBe(400);
        expect(updated.body.error.message).toBe(message);
    });

    it('passes on a 429 with its Retry-After', async () => {
        await setBehaviour({ retryAfterEvery: 1, retryAfterSeconds: 3 });
        try {
            const result = await runQuery(admin, source.events, {
                invalidateCache: true,
            });
            expect(result.status).toBe('error');
            expect(result.error).toMatch(/Hydra rate limit reached.*3 seconds/);
        } finally {
            await setBehaviour({});
        }
    });

    it("refuses calls past the source's per-minute limit", async () => {
        const limited = await createHydraSource(admin, 'limited', 'carol', {
            callsPerMinute: 1,
        });
        created.push(limited.uuid);
        const results = [];
        for (let call = 0; call < 3; call += 1) {
            // eslint-disable-next-line no-await-in-loop
            results.push(
                await runQuery(admin, limited.events, {
                    invalidateCache: true,
                }),
            );
        }
        // Three calls a few seconds apart cross at most one minute boundary
        expect(results[0].status).toBe('ready');
        expect(
            results
                .slice(1)
                .some(({ error }) =>
                    /limit of 1 calls per minute/.test(error ?? ''),
                ),
        ).toBe(true);
    });
});
