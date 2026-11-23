import {
    ChartType,
    FeatureFlags,
    HYDRA_ACCOUNT_PATH,
    HYDRA_DEFAULT_SOURCE,
    HYDRA_ORIGIN,
    HYDRA_REPORT_PATH,
    SchedulerFormat,
    SEED_ORG_1_EDITOR_EMAIL,
    SEED_PROJECT,
    type ApiExecuteAsyncMetricQueryResults,
    type ExternalConnection,
    type ExternalConnectionApiUsage,
    type HydraApiSource,
    type LiveSourceUserSignIn,
} from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, type Body } from '../helpers/api-client';
import { login, loginAsEditor, loginAsViewer } from '../helpers/auth';
import { mcpText, openMcpSession, personalAccessTokens } from '../helpers/mcp';
import { pollUntil } from '../helpers/polling';

// Each viewer's own sign-in, against Hydra as a strict OAuth vendor: what a
// careful vendor refuses stays refused, and nothing one viewer does reaches
// another. Each scenario uses its own source, since call counts and sign-ins
// are per source.

const projectUuid = SEED_PROJECT.project_uuid;
const connectionsUrl = `/api/v1/ee/projects/${projectUuid}/external-connections`;
const liveSourcesUrl = `/api/v1/ee/projects/${projectUuid}/live-sources`;
const flagUrl = `/api/v2/feature-flag/${FeatureFlags.ApiQuerySources}`;
const composeFlagUrl = `/api/v2/feature-flag/${FeatureFlags.ComposeSqlRunner}`;
const returnTo = `/projects/${projectUuid}/home`;

const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000)}`;

type Source = {
    connection: ExternalConnection;
    prefix: string;
    chartUuid: string;
};

type ChartOutcome =
    | { kind: 'sign_in_required'; reason: string }
    | { kind: 'ready'; eventCount: number }
    | { kind: 'error'; message: string };

const runChart = async (
    client: ApiClient,
    { chartUuid, prefix }: Source,
    headers: Record<string, string> = {},
): Promise<ChartOutcome & { queryUuid?: string }> => {
    const resp = await client.post<
        Body<ApiExecuteAsyncMetricQueryResults> & {
            error?: {
                name: string;
                message: string;
                data?: { signIn?: { reason: string } };
            };
        }
    >(
        `/api/v2/projects/${projectUuid}/query/chart`,
        { context: 'chartView', chartUuid, invalidateCache: true },
        { failOnStatusCode: false, headers },
    );
    if (resp.status !== 200) {
        const { error } = resp.body;
        return error?.name === 'LiveSourceSignInRequiredError' &&
            error.data?.signIn
            ? { kind: 'sign_in_required', reason: error.data.signIn.reason }
            : { kind: 'error', message: error?.message ?? `${resp.status}` };
    }
    const done = await pollUntil<
        Body<{
            status: string;
            error?: string | null;
            rows?: Record<string, { value: { raw: unknown } }>[];
        }>
    >(
        client,
        `/api/v2/projects/${projectUuid}/query/${resp.body.results.queryUuid}`,
        {
            timeout: 60_000,
            condition: (body) =>
                body.results.status === 'ready' ||
                body.results.status === 'error',
        },
    );
    if (done.results.status !== 'ready') {
        return { kind: 'error', message: done.results.error ?? 'error' };
    }
    const [row] = done.results.rows ?? [];
    return {
        kind: 'ready',
        eventCount: Number(row?.[`${prefix}_events_event_count`]?.value.raw),
        queryUuid: resp.body.results.queryUuid,
    };
};

/** Where a redirect points, as a URL. */
const locationOf = (resp: { headers: Headers }) =>
    new URL(resp.headers.get('location') ?? '');

/** A callback that sends the person back with only a failure code. */
const expectFailedReturn = (resp: { status: number; headers: Headers }) => {
    expect(resp.status).toBe(302);
    expect(locationOf(resp).searchParams.get('liveSourceSignInError')).toBe(
        'failed',
    );
};

/** Starts a sign-in and returns the consent screen's address. */
const startSignIn = async (client: ApiClient, source: Source) => {
    const start = await client.get(
        `${liveSourcesUrl}/${source.connection.externalConnectionUuid}/user-sign-in/start?returnTo=${returnTo}`,
        { failOnStatusCode: false },
    );
    expect(start.status).toBe(302);
    return locationOf(start);
};

const follow = (client: ApiClient, url: URL) =>
    client.get(`${url.pathname}${url.search}`, { failOnStatusCode: false });

/** The full sign-in, as a browser would follow it. */
const connect = async (client: ApiClient, source: Source) => {
    const consent = await follow(client, await startSignIn(client, source));
    expect(consent.status).toBe(302);
    const callback = await follow(client, locationOf(consent));
    expect(callback.status).toBe(302);
    expect(locationOf(callback).searchParams.get('liveSourceSignedIn')).toBe(
        source.connection.externalConnectionUuid,
    );
};

const isSignedIn = async (client: ApiClient, source: Source) => {
    const signIns = await client.get<Body<LiveSourceUserSignIn[]>>(
        `${liveSourcesUrl}/user-sign-ins`,
    );
    return (
        signIns.body.results.find(
            (signIn) =>
                signIn.externalConnectionUuid ===
                source.connection.externalConnectionUuid,
        )?.isSignedIn ?? false
    );
};

describe('Hydra sign-in for each viewer refuses what a careful vendor refuses', () => {
    let admin: ApiClient;
    let editor: ApiClient;
    let viewer: ApiClient;
    let clearFlag = false;
    let clearComposeFlag = false;
    const created: Source[] = [];

    const getApiCalls = async (source: Source) => {
        const resp = await admin.get<Body<ExternalConnectionApiUsage[]>>(
            `${connectionsUrl}/api-usage`,
        );
        return (
            resp.body.results.find(
                (usage) =>
                    usage.externalConnectionUuid ===
                    source.connection.externalConnectionUuid,
            )?.apiCalls ?? 0
        );
    };

    const createSource = async (
        name: string,
        settings: Partial<HydraApiSource> = {},
    ): Promise<Source> => {
        const prefix = `hydra_sec_${name}_${runId}`;
        const resp = await admin.post<Body<ExternalConnection>>(
            connectionsUrl,
            {
                name: `Hydra ${name} ${runId}`,
                type: 'bearer_token',
                origin: HYDRA_ORIGIN,
                secret: 'admin-token',
                apiSource: {
                    ...HYDRA_DEFAULT_SOURCE,
                    rowCount: 300,
                    ...settings,
                },
                signInMode: 'per_user',
                allowedMethods: ['GET', 'POST'],
                allowedPathPrefixes: [HYDRA_REPORT_PATH, HYDRA_ACCOUNT_PATH],
                allowedContentTypes: ['application/json'],
                explorePrefix: prefix,
            },
        );
        expect(resp.status).toBe(201);
        const chart = await admin.post<Body<{ uuid: string }>>(
            `/api/v1/projects/${projectUuid}/saved`,
            {
                name: `Hydra ${name} ${runId}`,
                tableName: `${prefix}_events`,
                metricQuery: {
                    exploreName: `${prefix}_events`,
                    dimensions: [],
                    metrics: [`${prefix}_events_event_count`],
                    filters: {},
                    sorts: [],
                    limit: 10,
                    tableCalculations: [],
                },
                chartConfig: { type: ChartType.TABLE },
                tableConfig: { columnOrder: [] },
            },
        );
        expect(chart.status).toBe(200);
        const source = {
            connection: resp.body.results,
            prefix,
            chartUuid: chart.body.results.uuid,
        };
        created.push(source);
        return source;
    };

    beforeAll(async () => {
        [admin, editor, viewer] = await Promise.all([
            login(),
            loginAsEditor(),
            loginAsViewer(),
        ]);
        const flag = await admin.get<Body<{ enabled: boolean }>>(flagUrl);
        if (!flag.body.results.enabled) {
            await admin.post(flagUrl, { enabled: true });
            clearFlag = true;
        }
        const compose =
            await admin.get<Body<{ enabled: boolean }>>(composeFlagUrl);
        if (!compose.body.results.enabled) {
            await admin.post(composeFlagUrl, { enabled: true });
            clearComposeFlag = true;
        }
    });

    afterAll(async () => {
        await Promise.all(
            created.map(async ({ connection, chartUuid }) => {
                await admin.delete(`/api/v1/saved/${chartUuid}`, {
                    failOnStatusCode: false,
                });
                await admin.delete(
                    `${connectionsUrl}/${connection.externalConnectionUuid}`,
                    { failOnStatusCode: false },
                );
            }),
        );
        await Promise.all(
            personalAccessTokens.map(({ client, uuid }) =>
                client.delete(
                    `/api/v1/user/me/personal-access-tokens/${uuid}`,
                    {
                        failOnStatusCode: false,
                    },
                ),
            ),
        );
        if (clearFlag) await admin.delete(flagUrl);
        if (clearComposeFlag) await admin.delete(composeFlagUrl);
    });

    it('accepts each callback once', async () => {
        const source = await createSource('replay');
        const consent = await follow(editor, await startSignIn(editor, source));
        const callbackUrl = locationOf(consent);
        expect((await follow(editor, callbackUrl)).status).toBe(302);

        const replay = await follow(editor, callbackUrl);

        expectFailedReturn(replay);
        expect(await isSignedIn(editor, source)).toBe(true);
    });

    it('stores nothing for a callback whose state was tampered with', async () => {
        const source = await createSource('state');
        const consent = await follow(editor, await startSignIn(editor, source));
        const callbackUrl = locationOf(consent);
        callbackUrl.searchParams.set('state', 'forged');

        expectFailedReturn(await follow(editor, callbackUrl));
        expect(await isSignedIn(editor, source)).toBe(false);
    });

    it('never answers another person’s callback with their own sign-in', async () => {
        const source = await createSource('swap');
        // The viewer's code, delivered to the editor's browser
        const viewerConsent = await follow(
            viewer,
            await startSignIn(viewer, source),
        );
        await startSignIn(editor, source);

        const callback = await follow(editor, locationOf(viewerConsent));

        expectFailedReturn(callback);
        expect(await isSignedIn(editor, source)).toBe(false);
        expect(await isSignedIn(viewer, source)).toBe(false);
    });

    it('keeps sign-ins started in two tabs apart', async () => {
        const first = await createSource('tab_one');
        const second = await createSource('tab_two');
        const firstConsent = await follow(
            editor,
            await startSignIn(editor, first),
        );
        const secondConsent = await follow(
            editor,
            await startSignIn(editor, second),
        );

        expect((await follow(editor, locationOf(firstConsent))).status).toBe(
            302,
        );
        expect((await follow(editor, locationOf(secondConsent))).status).toBe(
            302,
        );
        expect(await isSignedIn(editor, first)).toBe(true);
        expect(await isSignedIn(editor, second)).toBe(true);
    });

    it('refuses a consent request for another callback', async () => {
        const source = await createSource('redirect');
        const consentUrl = await startSignIn(editor, source);
        consentUrl.searchParams.set(
            'redirect_uri',
            'https://attacker.example.com/callback',
        );

        expect((await follow(editor, consentUrl)).status).toBe(400);
    });

    it('stores nothing when the person declines consent', async () => {
        const source = await createSource('deny', { denyConsent: true });
        const consent = await follow(editor, await startSignIn(editor, source));
        expect(locationOf(consent).searchParams.get('error')).toBe(
            'access_denied',
        );

        const callback = await follow(editor, locationOf(consent));

        expect(
            locationOf(callback).searchParams.get('liveSourceSignInError'),
        ).toBe('cancelled');
        expect(await isSignedIn(editor, source)).toBe(false);
        expect(await runChart(editor, source)).toMatchObject({
            kind: 'sign_in_required',
            reason: 'missing',
        });
    });

    it('refuses a code issued for another source', async () => {
        const source = await createSource('bound');
        const other = await createSource('other');
        const consentUrl = await startSignIn(editor, source);
        // A code for the other source, answered to this source's sign-in
        consentUrl.searchParams.set(
            'resource',
            other.connection.externalConnectionUuid,
        );
        const consent = await follow(editor, consentUrl);
        expect(consent.status).toBe(302);

        const callback = await follow(editor, locationOf(consent));

        expect(
            locationOf(callback).searchParams.get('liveSourceSignInError'),
        ).toBe('failed');
        expect(await isSignedIn(editor, source)).toBe(false);
        expect(await isSignedIn(editor, other)).toBe(false);
    });

    it('answers a missing scope to that viewer only, with no calls for anyone else', async () => {
        const source = await createSource('scopes', {
            viewerScopes: {
                [SEED_ORG_1_EDITOR_EMAIL.email]: ['users:read'],
            },
        });
        await connect(editor, source);
        await connect(viewer, source);

        const asEditor = await runChart(editor, source);
        const asViewer = await runChart(viewer, source);
        const asEditorAgain = await runChart(editor, source);

        expect(asEditor.kind).toBe('error');
        expect(asViewer).toMatchObject({ kind: 'ready' });
        // The viewer's rows never answer the editor
        expect(asEditorAgain.kind).toBe('error');
        expect(await getApiCalls(source)).toBeGreaterThanOrEqual(3);
    });

    it('keeps refreshing as Hydra rotates each refresh token', async () => {
        const source = await createSource('rotation', { tokenTtlSeconds: 1 });
        await connect(editor, source);
        // Tokens count as expired a minute early, so each query refreshes
        expect(await runChart(editor, source)).toMatchObject({
            kind: 'ready',
        });
        expect(await runChart(editor, source)).toMatchObject({
            kind: 'ready',
        });
        await connect(viewer, source);
        expect(await runChart(viewer, source)).toMatchObject({
            kind: 'ready',
        });
    });

    it('refuses a Slack link preview, which would post one viewer’s data to a channel', async () => {
        const source = await createSource('slack');
        await connect(editor, source);

        const preview = await runChart(editor, source, {
            'Lightdash-Request-Method': 'HEADLESS_BROWSER',
            'Lightdash-Headless-Browser-Context': 'slack',
        });

        expect(preview).toMatchObject({ kind: 'error' });
        if (preview.kind === 'error') {
            expect(preview.message).toContain("Slack can't preview it");
        }
        // The same person outside a preview reads their own data
        expect(await runChart(editor, source)).toMatchObject({
            kind: 'ready',
        });
    });

    it('never hands one viewer’s results to another, by uuid or through a composed query', async () => {
        const source = await createSource('compose');
        await connect(admin, source);
        const asAdmin = await runChart(admin, source);
        expect(asAdmin).toMatchObject({ kind: 'ready' });
        const { queryUuid } = asAdmin;

        const byUuid = await editor.get(
            `/api/v2/projects/${projectUuid}/query/${queryUuid}`,
            { failOnStatusCode: false },
        );
        const composed = await editor.post(
            `/api/v2/projects/${projectUuid}/query/compose-sql`,
            {
                sql: 'SELECT * FROM theirs',
                references: { theirs: queryUuid },
            },
            { failOnStatusCode: false },
        );

        expect(byUuid.status).toBe(404);
        expect(composed.status).toBe(404);
        // Their own composed query still works over their own results
        const own = await admin.post<Body<{ queryUuid: string }>>(
            `/api/v2/projects/${projectUuid}/query/compose-sql`,
            { sql: 'SELECT * FROM mine', references: { mine: queryUuid } },
            { failOnStatusCode: false },
        );
        expect(own.status).toBe(200);
    });

    it('runs an MCP query with the asker’s own sign-in', async () => {
        const source = await createSource('mcp');
        const askAsEditor = await openMcpSession(editor);
        const query = (projectArgs: Record<string, unknown>) =>
            askAsEditor('run_metric_query', {
                ...projectArgs,
                title: 'Events',
                description: 'Event count',
                queryConfig: {
                    exploreName: `${source.prefix}_events`,
                    dimensions: [],
                    metrics: [`${source.prefix}_events_event_count`],
                    sorts: [],
                    limit: 10,
                },
            });

        // The admin's sign-in never answers the editor's agent
        await connect(admin, source);
        const before = await query({ projectUuid });
        expect(before.isError).toBe(true);
        expect(mcpText(before)).toContain(
            source.connection.externalConnectionUuid,
        );

        await connect(editor, source);
        const after = await query({ projectUuid });
        if (after.isError) throw new Error(mcpText(after));
        const asEditor = await runChart(editor, source);
        const asAdmin = await runChart(admin, source);
        expect(asEditor.kind === 'ready' && asAdmin.kind === 'ready').toBe(
            true,
        );
        if (asEditor.kind === 'ready' && asAdmin.kind === 'ready') {
            expect(JSON.stringify(after)).toContain(
                String(asEditor.eventCount),
            );
            expect(asEditor.eventCount).not.toBe(asAdmin.eventCount);
        }
    });

    it('sends a delivery with the sign-in of the person it runs as', async () => {
        const source = await createSource('delivery');
        await connect(editor, source);
        const sendNow = async (client: ApiClient) => {
            const sent = await client.post<Body<{ jobId: string }>>(
                '/api/v1/schedulers/send',
                {
                    name: `Per viewer ${runId}`,
                    cron: '0 9 * * 1',
                    timezone: 'UTC',
                    format: SchedulerFormat.CSV,
                    options: { formatted: true, limit: 'table' },
                    targets: [{ recipient: 'per-viewer@example.com' }],
                    savedChartUuid: source.chartUuid,
                    dashboardUuid: null,
                    appUuid: null,
                    appName: null,
                    enabled: true,
                    includeLinks: true,
                },
            );
            expect(sent.status).toBe(200);
            const done = await pollUntil<
                Body<{ status: string; details: Record<string, unknown> }>
            >(
                client,
                `/api/v1/schedulers/job/${sent.body.results.jobId}/status`,
                {
                    timeout: 90_000,
                    condition: (body) =>
                        body.results.status === 'completed' ||
                        body.results.status === 'error',
                },
            );
            return done.results;
        };

        // The editor signed in; the admin never did, and gets no one's data
        expect(await sendNow(editor)).toMatchObject({ status: 'completed' });
        const asAdmin = await sendNow(admin);
        expect(asAdmin.status).toBe('error');
        expect(JSON.stringify(asAdmin.details)).toMatch(/sign in|connect/i);
    });
});
