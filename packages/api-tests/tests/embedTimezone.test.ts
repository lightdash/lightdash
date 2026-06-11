import { SEED_PROJECT, UpdateEmbed } from '@lightdash/common';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';

const EMBED_API_PREFIX = `/api/v1/embed/${SEED_PROJECT.project_uuid}`;
const SESSION_TIMEZONE = 'America/Los_Angeles';

type EmbedConfig = {
    dashboardUuids?: string[];
    allowAllDashboards?: boolean;
    chartUuids?: string[];
    allowAllCharts?: boolean;
};

type DashboardTile = {
    uuid: string;
    type: string;
    properties: { savedChartUuid?: string | null };
};

type ExecuteTileResponse = {
    queryUuid: string;
    resolvedTimezone: string | null;
};

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function getEmbedConfig(client: ApiClient) {
    return client.get<Body<EmbedConfig>>(`${EMBED_API_PREFIX}/config`);
}

async function updateEmbedConfig(client: ApiClient, body: UpdateEmbed) {
    return client.patch<Body<unknown>>(`${EMBED_API_PREFIX}/config`, body);
}

async function waitForEmbedConfigWithDashboards(
    client: ApiClient,
    expectedDashboardUuids: string[],
    maxAttempts = 10,
    delayMs = 500,
): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const resp = await getEmbedConfig(client);
        if (resp.status === 200) {
            const config = resp.body.results;
            const hasAll = expectedDashboardUuids.every((uuid) =>
                config.dashboardUuids?.includes(uuid),
            );
            if (hasAll) return;
        }
        if (attempt >= maxAttempts) {
            throw new Error(
                'Embed config did not contain expected dashboards.',
            );
        }
        await delay(delayMs);
    }
}

describe('Embed dashboard-tile session timezone (?timezone=)', () => {
    let admin: ApiClient;
    let embedEnabled = true;
    let dashboardUuid: string;
    let chartTileUuid: string;

    // Fresh JWT each test so it always uses the current embed secret
    async function freshDashboardJwt(): Promise<string> {
        const resp = await admin.post<Body<{ url: string }>>(
            `${EMBED_API_PREFIX}/get-embed-url`,
            {
                user: {
                    externalId: 'tz-user@example.com',
                    email: 'tz-user@example.com',
                },
                content: {
                    type: 'dashboard',
                    dashboardUuid,
                    projectUuid: SEED_PROJECT.project_uuid,
                },
                expiresIn: '24h',
            },
        );
        expect(resp.status).toBe(200);
        return resp.body.results.url.split('#')[1];
    }

    function embedHeaders(token: string) {
        return { 'Lightdash-Embed-Token': token };
    }

    async function executeTile(
        token: string,
        timezone: string | undefined,
        options?: { failOnStatusCode?: boolean },
    ) {
        return new ApiClient().post<Body<ExecuteTileResponse>>(
            `${EMBED_API_PREFIX}/query/dashboard-tile`,
            {
                tileUuid: chartTileUuid,
                dashboardFilters: {
                    dimensions: [],
                    metrics: [],
                    tableCalculations: [],
                },
                dashboardSorts: [],
                ...(timezone ? { timezone } : {}),
            },
            { headers: embedHeaders(token), ...options },
        );
    }

    beforeAll(async () => {
        admin = await login();

        const configResp = await admin.get<Body<EmbedConfig>>(
            `${EMBED_API_PREFIX}/config`,
            { failOnStatusCode: false },
        );
        if (configResp.status === 403) {
            embedEnabled = false;
            return;
        }
        expect(configResp.status).toBe(200);
        const existingConfig = configResp.body.results;

        const dashboardsResp = await admin.get<
            Body<Array<{ uuid: string; name: string }>>
        >(`/api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards`);
        expect(dashboardsResp.status).toBe(200);
        const seedDashboard = dashboardsResp.body.results.find(
            (d) => d.name === 'Jaffle dashboard',
        );
        expect(seedDashboard).toBeDefined();
        dashboardUuid = seedDashboard!.uuid;

        await updateEmbedConfig(admin, {
            dashboardUuids: [dashboardUuid],
            allowAllDashboards: false,
            chartUuids: existingConfig.chartUuids || [],
            allowAllCharts: true,
        });
        await waitForEmbedConfigWithDashboards(admin, [dashboardUuid]);

        const dashboardResp = await admin.get<Body<{ tiles: DashboardTile[] }>>(
            `/api/v1/dashboards/${dashboardUuid}?projectUuid=${SEED_PROJECT.project_uuid}`,
        );
        expect(dashboardResp.status).toBe(200);
        const chartTile = dashboardResp.body.results.tiles.find(
            (tile) =>
                tile.type === 'saved_chart' &&
                Boolean(tile.properties.savedChartUuid),
        );
        expect(chartTile).toBeDefined();
        chartTileUuid = chartTile!.uuid;
    });

    beforeEach((ctx) => {
        if (!embedEnabled) ctx.skip();
    });

    it('applies the session timezone, overriding the chart pin', async () => {
        const token = await freshDashboardJwt();
        const resp = await executeTile(token, SESSION_TIMEZONE);

        expect(resp.status).toBe(200);
        // resolvedTimezone is the gated display timezone — null when
        // EnableTimezoneSupport is off. When present, it must reflect the
        // session timezone we passed, proving it reached the resolver and
        // won over the chart pin / project default.
        if (resp.body.results.resolvedTimezone !== null) {
            expect(resp.body.results.resolvedTimezone).toBe(SESSION_TIMEZONE);
        }
    });

    it('totals inherit the session timezone without re-passing it', async () => {
        const token = await freshDashboardJwt();
        const tileResp = await executeTile(token, SESSION_TIMEZONE);
        expect(tileResp.status).toBe(200);
        const { queryUuid, resolvedTimezone } = tileResp.body.results;

        // Poll the tile query to completion via the v2 results endpoint
        // (embed token authorises it), then compute totals by queryUuid only.
        const tileClient = new ApiClient();
        let ready = false;
        for (let attempt = 0; attempt < 60 && !ready; attempt++) {
            const poll = await tileClient.get<Body<{ status: string }>>(
                `/api/v2/projects/${SEED_PROJECT.project_uuid}/query/${queryUuid}?page=1&pageSize=1`,
                { headers: embedHeaders(token) },
            );
            expect(poll.status).toBe(200);
            if (poll.body.results.status === 'ready') ready = true;
            else if (poll.body.results.status === 'error')
                throw new Error('Tile query failed');
            else await delay(500);
        }
        expect(ready).toBe(true);

        const totalsResp = await new ApiClient().post<
            Body<{ resolvedTimezone: string | null }>
        >(
            `/api/v2/projects/${SEED_PROJECT.project_uuid}/query/${queryUuid}/calculate-total`,
            { kind: 'columnTotal' },
            { headers: embedHeaders(token), failOnStatusCode: false },
        );

        expect(totalsResp.status).toBe(200);
        // The totals re-query rebuilds from the persisted source metricQuery,
        // so it must resolve to the same timezone as the originating tile.
        expect(totalsResp.body.results.resolvedTimezone).toBe(resolvedTimezone);
    });

    it('rejects an invalid session timezone with a 400 when timezone support is on', async () => {
        const token = await freshDashboardJwt();

        // Probe the flag: resolvedTimezone is null when EnableTimezoneSupport
        // is off, in which case the session timezone is gated out before
        // resolution and never validated.
        const probe = await executeTile(token, SESSION_TIMEZONE);
        expect(probe.status).toBe(200);
        const timezoneSupportEnabled =
            probe.body.results.resolvedTimezone !== null;

        const resp = await executeTile(token, 'Not/AZone', {
            failOnStatusCode: false,
        });

        if (timezoneSupportEnabled) {
            // Flag on: the invalid session timezone reaches the resolver and
            // is rejected as a ParameterError.
            expect(resp.status).toBe(400);
            expect(resp.body).toHaveProperty('error');
        } else {
            // Flag off: the session timezone is dropped at the embed boundary,
            // so the invalid value is inert and the query runs normally.
            expect(resp.status).toBe(200);
        }
    });
});
