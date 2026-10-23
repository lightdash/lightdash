import {
    FeatureFlags,
    SEED_PROJECT,
    type CreateEmbedJwt,
    type DecodedEmbed,
} from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiClient, type Body } from '../helpers/api-client';
import { login, loginWithPermissions } from '../helpers/auth';
import { pollUntil } from '../helpers/polling';

/**
 * AI analysis over a dashboard must only ever see the rows the calling
 * viewer ran, behind the dashboard's own rollout flag. Every request here
 * stops before the model is called, so the suite needs no LLM key: `lookup`
 * shares detect's gates but never runs the model.
 */

const { project_uuid: projectUuid } = SEED_PROJECT;
const analysisUrl = (dashboard: string, project = projectUuid) =>
    `/api/v2/projects/${project}/dashboards/${dashboard}/analysis`;
const aiSettingsUrl = '/api/v1/aiAgents/admin/settings';
const embedApiPrefix = `/api/v1/embed/${projectUuid}`;

const openQuery = {
    context: 'exploreView',
    query: {
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_total_order_amount'],
        filters: {},
        sorts: [],
        limit: 10,
        tableCalculations: [],
        additionalMetrics: [],
        metricOverrides: {},
    },
};

type AiSettings = Body<{ dataAppRuntimeAiEnabled?: boolean }>;
type FeatureFlag = Body<{ enabled: boolean }>;
type ErrorBody = {
    status: 'error';
    error: { statusCode: number; name: string; data: { code?: string } };
};

const expectNoResults = (body: unknown) => {
    expect(body).not.toHaveProperty('results');
    expect((body as ErrorBody).status).toBe('error');
};

const runQuery = (client: ApiClient) =>
    client.post<Body<{ queryUuid: string }>>(
        `/api/v2/projects/${projectUuid}/query/metric-query`,
        openQuery,
        { failOnStatusCode: false },
    );

const waitForQuery = (client: ApiClient, queryUuid: string) =>
    pollUntil<Body<{ status: string; error?: string }>>(
        client,
        `/api/v2/projects/${projectUuid}/query/${queryUuid}?page=1&pageSize=1`,
        {
            timeout: 60_000,
            condition: ({ results }) => {
                if (results.status === 'error') {
                    throw new Error(`Query failed: ${results.error}`);
                }
                return results.status === 'ready';
            },
        },
    );

describe('Dashboard analysis isolation', () => {
    let admin: ApiClient;
    let viewerA: ApiClient;
    let viewerB: ApiClient;
    let viewerAEmail: string;
    let viewerAUserUuid: string;
    let viewerAQueryUuid: string;
    let dashboardUuid: string;
    let originalRuntimeAi: boolean | null = null;
    let flagsToClear: string[] = [];
    // Copilot (and so AI analysis) is not enabled on every environment.
    let available = true;

    beforeAll(async () => {
        admin = await login();

        const settings = await admin.get<AiSettings>(aiSettingsUrl, {
            failOnStatusCode: false,
        });
        if (settings.status === 403) {
            available = false;
            return;
        }
        expect(settings.status).toBe(200);
        originalRuntimeAi =
            settings.body.results.dataAppRuntimeAiEnabled ?? false;
        await admin.patch(aiSettingsUrl, { dataAppRuntimeAiEnabled: true });

        // Leave flags that are already on alone: deleting an override falls
        // back to the environment default, which may be off. The data-apps
        // flags are deliberately not touched: dashboards have their own gate.
        for (const flag of [FeatureFlags.EnableDashboardAnalysis]) {
            const current = await admin.get<FeatureFlag>(
                `/api/v2/feature-flag/${flag}`,
            );
            if (!current.body.results.enabled) {
                await admin.post(`/api/v2/feature-flag/${flag}`, {
                    enabled: true,
                });
                flagsToClear.push(flag);
            }
        }

        const dashboards = await admin.get<
            Body<Array<{ uuid: string; spaceUuid: string }>>
        >(`/api/v1/projects/${projectUuid}/dashboards`);
        expect(dashboards.status).toBe(200);
        expect(dashboards.body.results.length).toBeGreaterThan(0);
        dashboardUuid = dashboards.body.results[0].uuid;

        const viewerALogin = await loginWithPermissions('member', [
            { role: 'interactive_viewer', projectUuid },
        ]);
        viewerA = viewerALogin.client;
        viewerAEmail = viewerALogin.email;
        viewerB = (
            await loginWithPermissions('member', [
                { role: 'interactive_viewer', projectUuid },
            ])
        ).client;
        const me =
            await viewerA.get<Body<{ userUuid: string }>>('/api/v1/user');
        viewerAUserUuid = me.body.results.userUuid;

        const executed = await runQuery(viewerA);
        expect(executed.status).toBe(200);
        viewerAQueryUuid = executed.body.results.queryUuid;
        await waitForQuery(viewerA, viewerAQueryUuid);
    });

    beforeEach((context) => {
        if (!available) context.skip();
    });

    afterAll(async () => {
        if (!available) return;
        for (const flag of flagsToClear) {
            await admin.delete(`/api/v2/feature-flag/${flag}`, {
                failOnStatusCode: false,
            });
        }
        flagsToClear = [];
        await admin.patch(aiSettingsUrl, {
            dataAppRuntimeAiEnabled: originalRuntimeAi ?? false,
        });
    });

    it('lets a viewer look up analysis over a query they ran', async () => {
        const resp = await viewerA.post<Body<null>>(
            `${analysisUrl(dashboardUuid)}/lookup`,
            { sources: [{ queryUuid: viewerAQueryUuid, label: 'Orders' }] },
        );
        expect(resp.status).toBe(200);
        expect(resp.body.results).toBeNull();
    });

    it("refuses another viewer's query as a source, for lookup and detect", async () => {
        const body = {
            sources: [{ queryUuid: viewerAQueryUuid, label: 'Orders' }],
        };
        const lookup = await viewerB.post(
            `${analysisUrl(dashboardUuid)}/lookup`,
            body,
            { failOnStatusCode: false },
        );
        expect(lookup.status).toBe(404);
        expectNoResults(lookup.body);

        const detect = await viewerB.post(
            `${analysisUrl(dashboardUuid)}/detect`,
            body,
            { failOnStatusCode: false },
        );
        expect(detect.status).toBe(404);
        expectNoResults(detect.body);
    });

    it.each([
        ['an unknown dashboard', () => analysisUrl(randomUUID()), null],
        [
            'the dashboard under another project',
            () => analysisUrl(dashboardUuid, randomUUID()),
            null,
        ],
        ['an unknown query', () => analysisUrl(dashboardUuid), randomUUID()],
    ])('returns 404 and no data for %s', async (_label, url, queryUuid) => {
        const resp = await viewerA.post(
            `${url()}/lookup`,
            {
                sources: [
                    { queryUuid: queryUuid ?? viewerAQueryUuid, label: null },
                ],
            },
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(404);
        expectNoResults(resp.body);
    });

    it('rejects a malformed dashboard uuid at the boundary', async () => {
        // The route param is UUID-typed: a slug never reaches the service.
        const resp = await viewerA.post(
            `${analysisUrl('jaffle-dashboard')}/lookup`,
            { sources: [{ queryUuid: viewerAQueryUuid, label: null }] },
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(422);
    });

    it('returns 404 for an analysis id the viewer does not own', async () => {
        const analysisId = randomUUID();
        const read = await viewerA.get(
            `${analysisUrl(dashboardUuid)}/${analysisId}`,
            { failOnStatusCode: false },
        );
        expect(read.status).toBe(404);
        expectNoResults(read.body);

        const investigate = await viewerA.post(
            `${analysisUrl(dashboardUuid)}/${analysisId}/investigate`,
            { anomalyId: 'anom', agentUuid: randomUUID() },
            { failOnStatusCode: false },
        );
        expect(investigate.status).toBe(404);
        expectNoResults(investigate.body);
    });

    it('refuses embed JWT accounts with unsupported_context', async () => {
        const config = await admin.get<Body<DecodedEmbed>>(
            `${embedApiPrefix}/config`,
            { failOnStatusCode: false },
        );
        if (config.status === 403) return; // embedding not licensed here
        expect(config.status).toBe(200);
        const [embedDashboardUuid] = config.body.results.dashboardUuids;
        expect(embedDashboardUuid).toBeDefined();

        const jwt: CreateEmbedJwt = {
            user: { externalId: 'dashboard-analysis-isolation' },
            content: { type: 'dashboard', dashboardUuid: embedDashboardUuid },
            expiresIn: '1h',
        };
        const embedUrl = await admin.post<Body<{ url: string }>>(
            `${embedApiPrefix}/get-embed-url`,
            jwt,
        );
        const [, token] = embedUrl.body.results.url.split('#');
        expect(token).toBeTruthy();

        const sources = [{ queryUuid: viewerAQueryUuid, label: null }];
        const embed = new ApiClient();
        const options = {
            headers: { 'Lightdash-Embed-Token': token },
            failOnStatusCode: false,
        };
        for (const [path, body] of [
            ['lookup', { sources }],
            ['detect', { sources }],
        ] as const) {
            const resp = await embed.post<ErrorBody>(
                `${analysisUrl(embedDashboardUuid)}/${path}`,
                body,
                options,
            );
            expect({ path, status: resp.status }).toEqual({
                path,
                status: 403,
            });
            expect(resp.body.error.data).toEqual({
                code: 'unsupported_context',
            });
        }
    });

    it('stops serving analyses once the viewer loses access to the project', async () => {
        const body = {
            sources: [{ queryUuid: viewerAQueryUuid, label: null }],
        };
        const before = await viewerA.post(
            `${analysisUrl(dashboardUuid)}/lookup`,
            body,
        );
        expect(before.status).toBe(200);

        const revoked = await admin.delete(
            `/api/v1/projects/${projectUuid}/access/${viewerAUserUuid}`,
        );
        expect(revoked.status).toBe(200);
        try {
            const resp = await viewerA.post<ErrorBody>(
                `${analysisUrl(dashboardUuid)}/lookup`,
                body,
                { failOnStatusCode: false },
            );
            expect([403, 404]).toContain(resp.status);
            expectNoResults(resp.body);
        } finally {
            const restored = await admin.post(
                `/api/v1/projects/${projectUuid}/access`,
                {
                    role: 'interactive_viewer',
                    email: viewerAEmail,
                    sendEmail: false,
                },
            );
            expect(restored.status).toBe(200);
        }
    });

    it('fails closed with org_setting_disabled once the org turns analysis off', async () => {
        await admin.patch(aiSettingsUrl, { dataAppRuntimeAiEnabled: false });
        try {
            const resp = await viewerA.post<ErrorBody>(
                `${analysisUrl(dashboardUuid)}/lookup`,
                { sources: [{ queryUuid: viewerAQueryUuid, label: null }] },
                { failOnStatusCode: false },
            );
            expect(resp.status).toBe(403);
            expect(resp.body.error.data).toEqual({
                code: 'org_setting_disabled',
            });
        } finally {
            await admin.patch(aiSettingsUrl, { dataAppRuntimeAiEnabled: true });
        }
    });
});
