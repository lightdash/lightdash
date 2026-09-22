import {
    FeatureFlags,
    SEED_DATA_APP_VIZ,
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
 * AI analysis over a data app must only ever see the rows the calling viewer
 * ran. Every request here stops before the model is called, so the suite
 * needs no LLM key: `lookup` shares detect's gates but never runs the model.
 */

const { project_uuid: projectUuid } = SEED_PROJECT;
const { appUuid } = SEED_DATA_APP_VIZ;
const analysisUrl = (app = appUuid, project = projectUuid) =>
    `/api/v2/projects/${project}/apps/${app}/analysis`;
const aiSettingsUrl = '/api/v1/aiAgents/admin/settings';
const attributesUrl = '/api/v1/org/attributes';
const embedApiPrefix = `/api/v1/embed/${projectUuid}`;

// The seeded `plan` explore requires the user attribute is_admin = "true".
const GATED_ATTRIBUTE = 'is_admin';
const gatedQuery = {
    context: 'exploreView',
    query: {
        exploreName: 'plan',
        dimensions: ['plan_plan_name'],
        metrics: ['plan_creator_count'],
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

const runGatedQuery = (client: ApiClient) =>
    client.post<Body<{ queryUuid: string }>>(
        `/api/v2/projects/${projectUuid}/query/metric-query`,
        gatedQuery,
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

describe('Data app analysis isolation', () => {
    let admin: ApiClient;
    let viewerA: ApiClient;
    let viewerB: ApiClient;
    let viewerAQueryUuid: string;
    let attributeUuid: string | null = null;
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
        // back to the environment default, which may be off.
        for (const flag of [
            FeatureFlags.EnableDataApps,
            FeatureFlags.EnableDataAppAnalysis,
        ]) {
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

        viewerA = (
            await loginWithPermissions('member', [
                { role: 'interactive_viewer', projectUuid },
            ])
        ).client;
        viewerB = (
            await loginWithPermissions('member', [
                { role: 'interactive_viewer', projectUuid },
            ])
        ).client;
        const me =
            await viewerA.get<Body<{ userUuid: string }>>('/api/v1/user');

        // A stale attribute from an aborted run would block the create.
        const existing =
            await admin.get<Body<Array<{ uuid: string; name: string }>>>(
                attributesUrl,
            );
        for (const attribute of existing.body.results) {
            if (attribute.name === GATED_ATTRIBUTE) {
                await admin.delete(`${attributesUrl}/${attribute.uuid}`);
            }
        }
        const created = await admin.post<Body<{ uuid: string }>>(
            attributesUrl,
            {
                name: GATED_ATTRIBUTE,
                users: [{ userUuid: me.body.results.userUuid, value: 'true' }],
                groups: [],
                attributeDefault: null,
            },
        );
        expect(created.status).toBe(201);
        attributeUuid = created.body.results.uuid;

        const executed = await runGatedQuery(viewerA);
        expect(executed.status).toBe(200);
        viewerAQueryUuid = executed.body.results.queryUuid;
        await waitForQuery(viewerA, viewerAQueryUuid);
    });

    beforeEach((context) => {
        if (!available) context.skip();
    });

    afterAll(async () => {
        if (!available) return;
        if (attributeUuid) {
            await admin.delete(`${attributesUrl}/${attributeUuid}`, {
                failOnStatusCode: false,
            });
        }
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

    it('keeps the user-attribute gate at the query layer', async () => {
        // A missing required attribute is an AuthorizationError (401).
        const resp = await runGatedQuery(viewerB);
        expect(resp.status).toBe(401);
    });

    it('lets a viewer look up analysis over a query they ran', async () => {
        const resp = await viewerA.post<Body<null>>(`${analysisUrl()}/lookup`, {
            sources: [{ queryUuid: viewerAQueryUuid, label: 'Plans' }],
        });
        expect(resp.status).toBe(200);
        expect(resp.body.results).toBeNull();
    });

    it("refuses another viewer's query as a source, for lookup and detect", async () => {
        const body = {
            sources: [{ queryUuid: viewerAQueryUuid, label: 'Plans' }],
        };
        const lookup = await viewerB.post(`${analysisUrl()}/lookup`, body, {
            failOnStatusCode: false,
        });
        expect(lookup.status).toBe(404);
        expectNoResults(lookup.body);

        const detect = await viewerB.post(`${analysisUrl()}/detect`, body, {
            failOnStatusCode: false,
        });
        expect(detect.status).toBe(404);
        expectNoResults(detect.body);
    });

    it.each([
        ['an unknown app', () => analysisUrl(randomUUID()), null],
        [
            'the app under another project',
            () => analysisUrl(appUuid, randomUUID()),
            null,
        ],
        ['an unknown query', () => analysisUrl(), randomUUID()],
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

    it('rejects a malformed source query uuid at the boundary', async () => {
        const resp = await viewerA.post(
            `${analysisUrl()}/lookup`,
            { sources: [{ queryUuid: 'not-a-uuid', label: null }] },
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(422);
    });

    it('returns 404 for an analysis id the viewer does not own', async () => {
        const analysisId = randomUUID();
        const read = await viewerA.get(`${analysisUrl()}/${analysisId}`, {
            failOnStatusCode: false,
        });
        expect(read.status).toBe(404);
        expectNoResults(read.body);

        const investigate = await viewerA.post(
            `${analysisUrl()}/${analysisId}/investigate`,
            { anomalyId: 'anom', agentUuid: randomUUID() },
            { failOnStatusCode: false },
        );
        expect(investigate.status).toBe(404);
        expectNoResults(investigate.body);
    });

    it('rejects a malformed analysis id at the boundary', async () => {
        const resp = await viewerA.get(`${analysisUrl()}/not-a-uuid`, {
            failOnStatusCode: false,
        });
        expect(resp.status).toBe(422);
    });

    it('refuses embed JWT accounts with unsupported_context', async () => {
        const config = await admin.get<Body<DecodedEmbed>>(
            `${embedApiPrefix}/config`,
            { failOnStatusCode: false },
        );
        if (config.status === 403) return; // embedding not licensed here
        expect(config.status).toBe(200);
        const [dashboardUuid] = config.body.results.dashboardUuids;
        expect(dashboardUuid).toBeDefined();

        const jwt: CreateEmbedJwt = {
            user: { externalId: 'data-app-analysis-isolation' },
            content: { type: 'dashboard', dashboardUuid },
            expiresIn: '1h',
        };
        const embedUrl = await admin.post<Body<{ url: string }>>(
            `${embedApiPrefix}/get-embed-url`,
            jwt,
        );
        const [, token] = embedUrl.body.results.url.split('#');
        expect(token).toBeTruthy();

        const resp = await new ApiClient().post<ErrorBody>(
            `${analysisUrl()}/detect`,
            { sources: [{ queryUuid: viewerAQueryUuid, label: null }] },
            {
                headers: { 'Lightdash-Embed-Token': token },
                failOnStatusCode: false,
            },
        );
        expect(resp.status).toBe(403);
        expect(resp.body.error.data).toEqual({ code: 'unsupported_context' });
    });

    it('fails closed with org_setting_disabled once the org turns analysis off', async () => {
        await admin.patch(aiSettingsUrl, { dataAppRuntimeAiEnabled: false });
        try {
            const resp = await viewerA.post<ErrorBody>(
                `${analysisUrl()}/lookup`,
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
