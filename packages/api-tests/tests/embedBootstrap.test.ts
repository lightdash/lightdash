import { CreateEmbedJwt, SEED_PROJECT, UpdateEmbed } from '@lightdash/common';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';

const EMBED_API_PREFIX = `/api/v1/embed/${SEED_PROJECT.project_uuid}`;

type EmbedConfig = {
    dashboardUuids?: string[];
    allowAllDashboards?: boolean;
    chartUuids?: string[];
    allowAllCharts?: boolean;
};

const embedHeaders = (token: string) => ({ 'Lightdash-Embed-Token': token });

async function mintDashboardToken(
    admin: ApiClient,
    dashboardUuid: string,
): Promise<string> {
    const body: CreateEmbedJwt = {
        user: { externalId: 'bootstrap-user@example.com' },
        content: {
            type: 'dashboard',
            projectUuid: SEED_PROJECT.project_uuid,
            dashboardUuid,
            canExportCsv: false,
            canExportImages: false,
            canExportPagePdf: false,
            canDateZoom: false,
            canExplore: false,
            canViewUnderlyingData: false,
            dashboardFiltersInteractivity: { enabled: true },
        },
        expiresIn: '1 hour',
    };
    const resp = await admin.post<Body<{ url: string }>>(
        `${EMBED_API_PREFIX}/get-embed-url`,
        body,
    );
    expect(resp.status).toBe(200);
    return resp.body.results.url.split('#')[1];
}

// The responses an embed loads on boot. Everything asserted as present here is
// read by the current frontend or by a published SDK version, so removing it
// breaks embeds that are already deployed; everything asserted as absent is
// project or account metadata an embed viewer must not see.
describe('Embed bootstrap responses', () => {
    let admin: ApiClient;
    let embedEnabled = true;
    let token: string;

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
        const config = configResp.body.results;

        const dashboardsResp = await admin.get<
            Body<Array<{ uuid: string; name: string }>>
        >(`/api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards`);
        const seedDashboard = dashboardsResp.body.results.find(
            (d) => d.name === 'Jaffle dashboard',
        );
        expect(seedDashboard).toBeDefined();
        const dashboardUuid = seedDashboard!.uuid;

        if (
            !config.allowAllDashboards &&
            !config.dashboardUuids?.includes(dashboardUuid)
        ) {
            const update: UpdateEmbed = {
                dashboardUuids: [
                    ...(config.dashboardUuids ?? []),
                    dashboardUuid,
                ],
                allowAllDashboards: false,
                chartUuids: config.chartUuids ?? [],
                allowAllCharts: config.allowAllCharts ?? false,
            };
            const updateResp = await admin.patch(
                `${EMBED_API_PREFIX}/config`,
                update,
            );
            expect(updateResp.status).toBe(200);
        }

        token = await mintDashboardToken(admin, dashboardUuid);
    });

    beforeEach((ctx) => {
        if (!embedEnabled) ctx.skip();
    });

    it('account response carries identity and permissions only', async () => {
        const anonymous = new ApiClient();
        const resp = await anonymous.get<Body<Record<string, unknown>>>(
            `/api/v1/user/account?projectUuid=${SEED_PROJECT.project_uuid}`,
            { headers: embedHeaders(token) },
        );
        expect(resp.status).toBe(200);
        const account = resp.body.results;

        expect(Object.keys(account).sort()).toEqual([
            'authentication',
            'organization',
            'user',
        ]);
        expect(account.authentication).toEqual({ type: 'jwt' });

        const organization = account.organization as Record<string, unknown>;
        expect(organization.organizationUuid).toEqual(expect.any(String));

        const user = account.user as Record<string, unknown>;
        expect(user.type).toBe('anonymous');
        expect(user.abilityRules).toEqual(expect.any(Array));
        expect(user).not.toHaveProperty('ability');

        expect(JSON.stringify(account)).not.toContain(token);
    });

    it('project response carries render settings only', async () => {
        const anonymous = new ApiClient();
        const resp = await anonymous.get<Body<Record<string, unknown>>>(
            `/api/v1/projects/${SEED_PROJECT.project_uuid}`,
            { headers: embedHeaders(token) },
        );
        expect(resp.status).toBe(200);
        const project = resp.body.results;

        expect(project.projectUuid).toBe(SEED_PROJECT.project_uuid);
        expect(project.organizationUuid).toEqual(expect.any(String));
        expect(project).toHaveProperty('queryTimezone');
        expect(project).toHaveProperty('useProjectTimezoneInFilters');

        expect(project.dbtConnection).toEqual({ type: 'none' });
        const warehouseConnection = project.warehouseConnection as
            | Record<string, unknown>
            | undefined;
        expect(warehouseConnection).toBeDefined();
        expect(warehouseConnection!.type).toEqual(expect.any(String));
        expect(
            Object.keys(warehouseConnection!).every((key) =>
                ['type', 'startOfWeek'].includes(key),
            ),
        ).toBe(true);

        expect(project.createdByUserUuid).toBeNull();
        expect(project.schedulerFailureContactOverride).toBeNull();
        expect(project).not.toHaveProperty('upstreamProjectUuid');
        expect(project).not.toHaveProperty(
            'organizationWarehouseCredentialsUuid',
        );
        expect(project).not.toHaveProperty('pinnedListUuid');
    });
});
