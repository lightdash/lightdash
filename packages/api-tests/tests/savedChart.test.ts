import {
    CreateChartInDashboard,
    CreateChartInSpace,
    Dashboard,
    SavedChart,
    SEED_ORG_1_EDITOR,
    SEED_PROJECT,
    SpaceMemberRole,
} from '@lightdash/common';
import { login, loginAsEditor } from '../helpers/auth';
import { chartMock, dashboardMock } from '../helpers/mocks';

const apiUrl = '/api/v1';

describe('Saved chart space selection', () => {
    const chartName = 'Chart space selection test';
    const dashboardName = 'Dashboard for chart space selection test';

    let admin: Awaited<ReturnType<typeof login>>;
    const createdChartUuids: string[] = [];
    const createdDashboardUuids: string[] = [];
    const createdSpaceUuids: string[] = [];

    beforeAll(async () => {
        admin = await login();
    });

    afterAll(async () => {
        // Clean up charts
        for (const uuid of createdChartUuids) {
            await admin
                .delete(`${apiUrl}/saved/${uuid}`, {
                    failOnStatusCode: false,
                })
                .catch(() => {});
        }
        // Clean up dashboards
        for (const uuid of createdDashboardUuids) {
            await admin
                .delete(`${apiUrl}/dashboards/${uuid}`, {
                    failOnStatusCode: false,
                })
                .catch(() => {});
        }
        // Clean up spaces
        for (const uuid of createdSpaceUuids) {
            await admin
                .delete(
                    `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${uuid}`,
                    { failOnStatusCode: false },
                )
                .catch(() => {});
        }
    });

    it('Should create a chart in the specified space', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const spaceName = `test-chart-space-${Date.now()}`;

        // Create space
        const spaceResp = await admin.post<{
            results: { uuid: string };
        }>(`${apiUrl}/projects/${projectUuid}/spaces/`, {
            name: spaceName,
            isPrivate: false,
        });
        const spaceUuid = spaceResp.body.results.uuid;
        createdSpaceUuids.push(spaceUuid);

        const body: CreateChartInSpace = {
            ...chartMock,
            name: chartName,
            spaceUuid,
            dashboardUuid: null,
        };

        const response = await admin.post<{ results: SavedChart }>(
            `${apiUrl}/projects/${projectUuid}/saved`,
            body,
        );
        expect(response.status).toBe(200);
        const chart = response.body.results;
        createdChartUuids.push(chart.uuid);

        // Fetch the chart to verify persisted state
        const getResponse = await admin.get<{ results: SavedChart }>(
            `${apiUrl}/saved/${chart.uuid}`,
        );
        expect(getResponse.status).toBe(200);
        const fetchedChart = getResponse.body.results;
        expect(fetchedChart.spaceUuid).toBe(spaceUuid);
        expect(fetchedChart.dashboardUuid).toBeNull();
    });

    it('Should create a chart in the first accessible space when no spaceUuid is provided', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const body: CreateChartInSpace = {
            ...chartMock,
            name: chartName,
            spaceUuid: undefined,
            dashboardUuid: null,
        };

        const response = await admin.post<{ results: SavedChart }>(
            `${apiUrl}/projects/${projectUuid}/saved`,
            body,
        );
        expect(response.status).toBe(200);
        const chart = response.body.results;
        createdChartUuids.push(chart.uuid);

        // Fetch the chart to verify persisted state
        const getResponse = await admin.get<{ results: SavedChart }>(
            `${apiUrl}/saved/${chart.uuid}`,
        );
        expect(getResponse.status).toBe(200);
        const fetchedChart = getResponse.body.results;
        expect(fetchedChart.spaceUuid).toBeDefined();
        expect(typeof fetchedChart.spaceUuid).toBe('string');
        expect(fetchedChart.dashboardUuid).toBeNull();

        // Verify the space exists in the project
        const spacesResponse = await admin.get<{
            results: Array<{ uuid: string }>;
        }>(`${apiUrl}/projects/${projectUuid}/spaces`);
        const spaceUuids = spacesResponse.body.results.map((s) => s.uuid);
        expect(spaceUuids).toContain(fetchedChart.spaceUuid);
    });

    it('Should create a chart belonging to a dashboard', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        // Create dashboard
        const dashResp = await admin.post<{ results: Dashboard }>(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
            { ...dashboardMock, name: dashboardName },
        );
        const dashboard = dashResp.body.results;
        createdDashboardUuids.push(dashboard.uuid);

        const body: CreateChartInDashboard = {
            ...chartMock,
            name: chartName,
            dashboardUuid: dashboard.uuid,
            spaceUuid: null,
        };

        const response = await admin.post<{ results: SavedChart }>(
            `${apiUrl}/projects/${projectUuid}/saved`,
            body,
        );
        expect(response.status).toBe(200);
        const chart = response.body.results;
        createdChartUuids.push(chart.uuid);

        // Fetch the chart to verify persisted state
        const getResponse = await admin.get<{ results: SavedChart }>(
            `${apiUrl}/saved/${chart.uuid}`,
        );
        expect(getResponse.status).toBe(200);
        const fetchedChart = getResponse.body.results;
        expect(fetchedChart.dashboardUuid).toBe(dashboard.uuid);
        expect(fetchedChart.spaceUuid).toBe(dashboard.spaceUuid);
    });
});

describe('Saved chart cross-space dashboard permissions', () => {
    const projectUuid = SEED_PROJECT.project_uuid;
    const testPrefix = `test-cross-space-${Date.now()}`;
    const editorUserUuid = SEED_ORG_1_EDITOR.user_uuid;

    let admin: Awaited<ReturnType<typeof login>>;
    let editor: Awaited<ReturnType<typeof loginAsEditor>>;
    let chartSpaceUuid: string;
    let dashboardSpaceUuid: string;
    let dashboardUuid: string;

    beforeAll(async () => {
        admin = await login();
        editor = await loginAsEditor();

        // Create Space A (chart space - editor will have VIEW access)
        const spaceAResp = await admin.post<{
            results: { uuid: string };
        }>(`${apiUrl}/projects/${projectUuid}/spaces/`, {
            name: `${testPrefix}-chart-space`,
            isPrivate: true,
        });
        chartSpaceUuid = spaceAResp.body.results.uuid;

        // Create Space B (dashboard space - editor will have ADMIN access)
        const spaceBResp = await admin.post<{
            results: { uuid: string };
        }>(`${apiUrl}/projects/${projectUuid}/spaces/`, {
            name: `${testPrefix}-dashboard-space`,
            isPrivate: true,
        });
        dashboardSpaceUuid = spaceBResp.body.results.uuid;

        // Create dashboard in Space B
        const dashResp = await admin.post<{ results: Dashboard }>(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
            {
                ...dashboardMock,
                name: `${testPrefix}-dashboard`,
                spaceUuid: dashboardSpaceUuid,
            },
        );
        dashboardUuid = dashResp.body.results.uuid;

        // Give editor VIEW access to chart space
        await admin.post(
            `${apiUrl}/projects/${projectUuid}/spaces/${chartSpaceUuid}/share`,
            {
                userUuid: editorUserUuid,
                spaceRole: SpaceMemberRole.VIEWER,
            },
        );

        // Give editor ADMIN access to dashboard space
        await admin.post(
            `${apiUrl}/projects/${projectUuid}/spaces/${dashboardSpaceUuid}/share`,
            {
                userUuid: editorUserUuid,
                spaceRole: SpaceMemberRole.ADMIN,
            },
        );
    });

    afterAll(async () => {
        // Clean up spaces (cascades to dashboards and charts)
        await admin
            .delete(
                `${apiUrl}/projects/${projectUuid}/spaces/${chartSpaceUuid}`,
                { failOnStatusCode: false },
            )
            .catch(() => {});
        await admin
            .delete(
                `${apiUrl}/projects/${projectUuid}/spaces/${dashboardSpaceUuid}`,
                { failOnStatusCode: false },
            )
            .catch(() => {});
    });

    it('Should allow saving a chart to a dashboard when user has admin access to dashboard space but only view access to chart space', async () => {
        // Send both dashboardUuid and spaceUuid (pointing to a different space)
        // This mimics the frontend behavior of "explore from here" -> save to dashboard
        // Permission should be checked against the dashboard's space, not the chart's spaceUuid
        const body = {
            ...chartMock,
            name: `${testPrefix}-chart`,
            dashboardUuid,
            spaceUuid: chartSpaceUuid,
        };

        const response = await editor.post<{ results: SavedChart }>(
            `${apiUrl}/projects/${projectUuid}/saved`,
            body,
        );
        expect(response.status).toBe(200);
        const chart = response.body.results;

        expect(chart.dashboardUuid).toBe(dashboardUuid);
        expect(chart.spaceUuid).toBe(dashboardSpaceUuid);
    });
});

describe('Chart slug disambiguation with projectUuid', () => {
    let admin: Awaited<ReturnType<typeof login>>;
    let previewProjectUuid: string | null = null;

    beforeAll(async () => {
        admin = await login();

        // Create a preview project that copies content — charts will share
        // the same slugs as the seed project
        const response = await admin.post<{
            status: string;
            results: { projectUuid: string };
        }>(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/createPreview`, {
            name: 'Chart slug disambiguation test project',
            copyContent: true,
        });
        expect(response.status).toBe(200);
        previewProjectUuid = response.body.results.projectUuid;
    });

    afterAll(async () => {
        if (previewProjectUuid) {
            await admin
                .delete(`${apiUrl}/org/projects/${previewProjectUuid}`, {
                    failOnStatusCode: false,
                })
                .catch(() => {});
        }
    });

    it('Should return correct chart when projectUuid query param is provided', async () => {
        const slug = 'how-much-revenue-do-we-have-per-payment-method';

        // Fetch from the seed project with projectUuid
        const seedResponse = await admin.get<{ results: SavedChart }>(
            `${apiUrl}/saved/${slug}?projectUuid=${SEED_PROJECT.project_uuid}`,
        );
        expect(seedResponse.status).toBe(200);
        expect(seedResponse.body.results.projectUuid).toBe(
            SEED_PROJECT.project_uuid,
        );

        // Fetch from the preview project with projectUuid
        const previewResponse = await admin.get<{ results: SavedChart }>(
            `${apiUrl}/saved/${slug}?projectUuid=${previewProjectUuid}`,
        );
        expect(previewResponse.status).toBe(200);
        expect(previewResponse.body.results.projectUuid).toBe(
            previewProjectUuid,
        );

        // The two charts should have different UUIDs but the same slug
        expect(seedResponse.body.results.uuid).not.toBe(
            previewResponse.body.results.uuid,
        );
        expect(seedResponse.body.results.slug).toBe(
            previewResponse.body.results.slug,
        );
    });

    it('Should return an ambiguous result without projectUuid when slugs collide', async () => {
        const slug = 'how-much-revenue-do-we-have-per-payment-method';

        // First, confirm both projects have a chart with this slug
        const seedResponse = await admin.get<{ results: SavedChart }>(
            `${apiUrl}/saved/${slug}?projectUuid=${SEED_PROJECT.project_uuid}`,
        );
        const previewResponse = await admin.get<{ results: SavedChart }>(
            `${apiUrl}/saved/${slug}?projectUuid=${previewProjectUuid}`,
        );
        expect(seedResponse.body.results.uuid).not.toBe(
            previewResponse.body.results.uuid,
        );

        // Without projectUuid, the API returns one of the two — we can't
        // control which. This proves the ambiguity exists.
        const ambiguousResponse = await admin.get<{ results: SavedChart }>(
            `${apiUrl}/saved/${slug}`,
        );
        expect(ambiguousResponse.status).toBe(200);
        expect(ambiguousResponse.body.results.slug).toBe(slug);

        // The returned chart is from one of the two projects but we
        // cannot guarantee which one — that's the bug this fix addresses
        const returnedProjectUuid = ambiguousResponse.body.results.projectUuid;
        expect([SEED_PROJECT.project_uuid, previewProjectUuid]).toContain(
            returnedProjectUuid,
        );
    });
});
