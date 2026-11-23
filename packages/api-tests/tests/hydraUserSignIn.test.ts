import {
    ChartType,
    FeatureFlags,
    HYDRA_ACCOUNT_PATH,
    HYDRA_DEFAULT_SOURCE,
    HYDRA_ORIGIN,
    HYDRA_REPORT_PATH,
    SEED_ORG_1_EDITOR_EMAIL,
    SEED_PROJECT,
    type ApiExecuteAsyncMetricQueryResults,
    type CreateExternalConnection,
    type ExternalConnection,
    type HydraApiSource,
    type LiveSourceUserSignIn,
    type ResultsCacheProjectSettings,
} from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, type Body } from '../helpers/api-client';
import { login, loginAsEditor, loginAsViewer } from '../helpers/auth';
import { pollUntil } from '../helpers/polling';

// A live data source that queries with each viewer's own sign-in, through
// Hydra: its consent screen signs each Lightdash user in as themselves, and
// each of them reads their own seeded rows from the same chart.

const projectUuid = SEED_PROJECT.project_uuid;
const connectionsUrl = `/api/v1/ee/projects/${projectUuid}/external-connections`;
const liveSourcesUrl = `/api/v1/ee/projects/${projectUuid}/live-sources`;
const cacheSettingsUrl = `/api/v1/projects/${projectUuid}/results-cache-config`;
const flagUrl = `/api/v2/feature-flag/${FeatureFlags.ApiQuerySources}`;

const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000)}`;
const prefix = `hydra_viewer_${runId}`;

type ChartOutcome =
    | { kind: 'sign_in_required'; reason: string; connectUrl: string }
    | { kind: 'ready'; cacheHit: boolean; eventCount: number }
    | { kind: 'error'; message: string };

/** Runs the saved chart as this person, the way the chart page does. */
const runChart = async (
    client: ApiClient,
    chartUuid: string,
    invalidateCache = false,
): Promise<ChartOutcome> => {
    const resp = await client.post<
        Body<ApiExecuteAsyncMetricQueryResults> & {
            error?: {
                name: string;
                message: string;
                data?: {
                    signIn?: { reason: string; connectUrl: string };
                };
            };
        }
    >(
        `/api/v2/projects/${projectUuid}/query/chart`,
        { context: 'chartView', chartUuid, invalidateCache },
        { failOnStatusCode: false },
    );
    if (resp.status !== 200) {
        const { error } = resp.body;
        return error?.name === 'LiveSourceSignInRequiredError' &&
            error.data?.signIn
            ? {
                  kind: 'sign_in_required',
                  reason: error.data.signIn.reason,
                  connectUrl: error.data.signIn.connectUrl,
              }
            : { kind: 'error', message: error?.message ?? `${resp.status}` };
    }
    const { queryUuid, cacheMetadata } = resp.body.results;
    const done = await pollUntil<
        Body<{
            status: string;
            error?: string | null;
            rows?: Record<string, { value: { raw: unknown } }>[];
        }>
    >(client, `/api/v2/projects/${projectUuid}/query/${queryUuid}`, {
        timeout: 60_000,
        condition: (body) =>
            body.results.status === 'ready' || body.results.status === 'error',
    });
    if (done.results.status !== 'ready') {
        return { kind: 'error', message: done.results.error ?? 'error' };
    }
    const [row] = done.results.rows ?? [];
    return {
        kind: 'ready',
        cacheHit: cacheMetadata.cacheHit,
        eventCount: Number(row?.[`${prefix}_events_event_count`]?.value.raw),
    };
};

/** Follows the sign-in the way a browser would: start, Hydra's consent, callback. */
const connect = async (client: ApiClient, connectionUuid: string) => {
    const start = await client.get(
        `${liveSourcesUrl}/${connectionUuid}/user-sign-in/start?returnTo=/projects/${projectUuid}/home`,
        { failOnStatusCode: false },
    );
    expect(start.status).toBe(302);
    const consent = await client.get(start.headers.get('location') ?? '', {
        failOnStatusCode: false,
    });
    expect(consent.status).toBe(302);
    const callback = await client.get(consent.headers.get('location') ?? '', {
        failOnStatusCode: false,
    });
    expect(callback.status).toBe(302);
    const back = new URL(callback.headers.get('location') ?? '');
    expect(back.pathname).toBe(`/projects/${projectUuid}/home`);
    expect(back.searchParams.get('liveSourceSignedIn')).toBe(connectionUuid);
};

describe('Live data sources that query with each viewer’s own sign-in', () => {
    let admin: ApiClient;
    let editor: ApiClient;
    let viewer: ApiClient;
    let source: ExternalConnection;
    let chartUuid: string;
    let spaceUuid: string;
    let clearFlag = false;
    let restoreCache: boolean | null = null;

    const setBehaviour = async (settings: Partial<HydraApiSource>) => {
        const resp = await admin.patch(
            `${connectionsUrl}/${source.externalConnectionUuid}`,
            { apiSource: { ...HYDRA_DEFAULT_SOURCE, ...settings } },
        );
        expect(resp.status).toBe(200);
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
        const cache =
            await admin.get<Body<ResultsCacheProjectSettings>>(
                cacheSettingsUrl,
            );
        if (!cache.body.results.cacheEnabled) {
            restoreCache = false;
            await admin.patch(cacheSettingsUrl, { cacheEnabled: true });
        }

        const body: CreateExternalConnection = {
            name: `Hydra per viewer ${runId}`,
            type: 'bearer_token',
            origin: HYDRA_ORIGIN,
            secret: 'admin-token',
            apiSource: { ...HYDRA_DEFAULT_SOURCE, rowCount: 300 },
            signInMode: 'per_user',
            allowedMethods: ['GET', 'POST'],
            allowedPathPrefixes: [HYDRA_REPORT_PATH, HYDRA_ACCOUNT_PATH],
            allowedContentTypes: ['application/json'],
            explorePrefix: prefix,
        };
        const created = await admin.post<Body<ExternalConnection>>(
            connectionsUrl,
            body,
        );
        expect(created.status).toBe(201);
        source = created.body.results;
        expect(source.signInMode).toBe('per_user');

        const space = await admin.post<Body<{ uuid: string }>>(
            `/api/v1/projects/${projectUuid}/spaces/`,
            { name: `Per viewer ${runId}`, inheritParentPermissions: true },
        );
        spaceUuid = space.body.results.uuid;
        const chart = await admin.post<Body<{ uuid: string }>>(
            `/api/v1/projects/${projectUuid}/saved`,
            {
                name: `Events per viewer ${runId}`,
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
                spaceUuid,
            },
        );
        expect(chart.status).toBe(200);
        chartUuid = chart.body.results.uuid;
    });

    afterAll(async () => {
        if (chartUuid) {
            await admin.delete(`/api/v1/saved/${chartUuid}`, {
                failOnStatusCode: false,
            });
        }
        if (spaceUuid) {
            await admin.delete(
                `/api/v1/projects/${projectUuid}/spaces/${spaceUuid}`,
                { failOnStatusCode: false },
            );
        }
        if (source) {
            await admin.delete(
                `${connectionsUrl}/${source.externalConnectionUuid}`,
                { failOnStatusCode: false },
            );
        }
        if (restoreCache !== null) {
            await admin.patch(cacheSettingsUrl, { cacheEnabled: restoreCache });
        }
        if (clearFlag) await admin.delete(flagUrl);
    });

    it('asks a viewer who has not signed in to connect, instead of failing', async () => {
        const outcome = await runChart(viewer, chartUuid);

        expect(outcome).toMatchObject({
            kind: 'sign_in_required',
            reason: 'missing',
        });
        if (outcome.kind === 'sign_in_required') {
            expect(new URL(outcome.connectUrl).pathname).toBe(
                `${liveSourcesUrl}/${source.externalConnectionUuid}/user-sign-in/start`,
            );
        }
        const signIns = await viewer.get<Body<LiveSourceUserSignIn[]>>(
            `${liveSourcesUrl}/user-sign-ins`,
        );
        expect(signIns.body.results).toContainEqual(
            expect.objectContaining({
                externalConnectionUuid: source.externalConnectionUuid,
                isSignedIn: false,
            }),
        );
    });

    it('shows two viewers their own numbers from the same chart', async () => {
        await connect(editor, source.externalConnectionUuid);
        await connect(viewer, source.externalConnectionUuid);

        const asEditor = await runChart(editor, chartUuid, true);
        const asViewer = await runChart(viewer, chartUuid, true);

        expect(asEditor.kind).toBe('ready');
        expect(asViewer.kind).toBe('ready');
        if (asEditor.kind === 'ready' && asViewer.kind === 'ready') {
            expect(asEditor.eventCount).toBeGreaterThan(0);
            expect(asViewer.eventCount).toBeGreaterThan(0);
            expect(asEditor.eventCount).not.toBe(asViewer.eventCount);
        }
    });

    it('reuses a viewer’s own results, and never another viewer’s', async () => {
        const first = await runChart(editor, chartUuid, true);
        const again = await runChart(editor, chartUuid);
        const other = await runChart(viewer, chartUuid);

        expect(again).toMatchObject({ kind: 'ready', cacheHit: true });
        if (first.kind === 'ready' && again.kind === 'ready') {
            expect(again.eventCount).toBe(first.eventCount);
        }
        // The viewer's own run earlier may answer them, but never the editor's
        if (first.kind === 'ready' && other.kind === 'ready') {
            expect(other.eventCount).not.toBe(first.eventCount);
        }
    });

    it('never answers a new sign-in with results cached under the old one', async () => {
        const signedInAt = async () => {
            const signIns = await editor.get<Body<LiveSourceUserSignIn[]>>(
                `${liveSourcesUrl}/user-sign-ins`,
            );
            return signIns.body.results.find(
                (signIn) =>
                    signIn.externalConnectionUuid ===
                    source.externalConnectionUuid,
            )?.signedInAt;
        };
        await runChart(editor, chartUuid);
        expect(await runChart(editor, chartUuid)).toMatchObject({
            kind: 'ready',
            cacheHit: true,
        });
        const before = await signedInAt();

        await connect(editor, source.externalConnectionUuid);

        const after = await signedInAt();
        expect(new Date(after ?? 0).getTime()).toBeGreaterThan(
            new Date(before ?? 0).getTime(),
        );
        expect(await runChart(editor, chartUuid)).toMatchObject({
            kind: 'ready',
            cacheHit: false,
        });
    });

    it('refreshes a sign-in whose token expired', async () => {
        await setBehaviour({ rowCount: 300, tokenTtlSeconds: 1 });
        await connect(editor, source.externalConnectionUuid);
        const before = await runChart(editor, chartUuid, true);
        // Tokens count as expired a minute early, so the next query refreshes
        const after = await runChart(editor, chartUuid, true);

        expect(after).toMatchObject({ kind: 'ready' });
        if (before.kind === 'ready' && after.kind === 'ready') {
            expect(after.eventCount).toBe(before.eventCount);
        }
        await setBehaviour({ rowCount: 300 });
    });

    it('asks only the revoked viewer to connect again', async () => {
        await setBehaviour({ rowCount: 300, tokenTtlSeconds: 1 });
        await connect(editor, source.externalConnectionUuid);
        await connect(viewer, source.externalConnectionUuid);
        await setBehaviour({
            rowCount: 300,
            tokenTtlSeconds: 1,
            revokedViewers: [SEED_ORG_1_EDITOR_EMAIL.email],
        });

        expect(await runChart(editor, chartUuid, true)).toMatchObject({
            kind: 'sign_in_required',
            reason: 'expired',
        });
        // The refused sign-in is forgotten, so it stays a prompt, not an error
        expect(await runChart(editor, chartUuid, true)).toMatchObject({
            kind: 'sign_in_required',
            reason: 'missing',
        });
        // Hydra's consent screen declines them too until the revocation lifts
        const start = await editor.get(
            `${liveSourcesUrl}/${source.externalConnectionUuid}/user-sign-in/start?returnTo=/projects/${projectUuid}/home`,
            { failOnStatusCode: false },
        );
        const consent = await editor.get(start.headers.get('location') ?? '', {
            failOnStatusCode: false,
        });
        expect(
            new URL(consent.headers.get('location') ?? '').searchParams.get(
                'error',
            ),
        ).toBe('access_denied');
        expect(await runChart(viewer, chartUuid, true)).toMatchObject({
            kind: 'ready',
        });
        await setBehaviour({ rowCount: 300 });
        await connect(editor, source.externalConnectionUuid);
    });

    it('stops reading a viewer’s data once they disconnect', async () => {
        const deleted = await viewer.delete(
            `${liveSourcesUrl}/${source.externalConnectionUuid}/user-sign-in`,
        );
        expect(deleted.status).toBe(200);

        expect(await runChart(viewer, chartUuid)).toMatchObject({
            kind: 'sign_in_required',
            reason: 'missing',
        });
    });

    it('keeps one sign-in for everyone when the source goes back to shared', async () => {
        const updated = await admin.patch<Body<ExternalConnection>>(
            `${connectionsUrl}/${source.externalConnectionUuid}`,
            { signInMode: 'shared' },
        );
        expect(updated.body.results.signInMode).toBe('shared');

        const asEditor = await runChart(editor, chartUuid, true);
        const asViewer = await runChart(viewer, chartUuid, true);

        expect(asEditor.kind).toBe('ready');
        if (asEditor.kind === 'ready' && asViewer.kind === 'ready') {
            expect(asViewer.eventCount).toBe(asEditor.eventCount);
        }
    });
});
