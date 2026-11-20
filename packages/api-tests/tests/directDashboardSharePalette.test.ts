import {
    SEED_ORG_1_VIEWER,
    SEED_PROJECT,
    SpaceMemberRole,
    type ApiCreatedColorPaletteResponse,
    type ApiHealthResults,
    type ApiProjectColorPaletteResponse,
    type ApiSpaceResponse,
    type CreateChartInDashboard,
    type Dashboard,
    type SavedChart,
} from '@lightdash/common';
import { expect, it, onTestFinished } from 'vitest';
import { type Body } from '../helpers/api-client';
import { login, loginAsViewer } from '../helpers/auth';
import { chartMock, dashboardMock } from '../helpers/mocks';
import { uniqueName } from '../helpers/test-isolation';

it('resolves inherited palettes for a dashboard-owned chart via a direct dashboard share', async (ctx) => {
    const admin = await login();
    const health = await admin.get<Body<ApiHealthResults>>('/api/v1/health');
    if (!health.body.results.license?.valid) {
        ctx.skip('Direct dashboard sharing requires a licensed instance');
    }

    const projectUuid = SEED_PROJECT.project_uuid;
    const project = `/api/v1/projects/${projectUuid}`;
    const projectV2 = `/api/v2/projects/${projectUuid}`;
    const colors = Array.from(
        { length: 20 },
        (_, index) => `#1234${index.toString(16).padStart(2, '0')}`,
    );
    const paletteName = uniqueName('Shared dashboard palette');
    const palette = await admin.post<ApiCreatedColorPaletteResponse>(
        '/api/v1/org/color-palettes',
        { name: paletteName, colors },
    );
    const { colorPaletteUuid } = palette.body.results;
    onTestFinished(async () => {
        await admin.delete(`/api/v1/org/color-palettes/${colorPaletteUuid}`);
    });

    const spaceName = uniqueName('Dashboard share space');
    const space = await admin.post<ApiSpaceResponse>(`${project}/spaces`, {
        name: spaceName,
        inheritParentPermissions: false,
    });
    const spaceUuid = space.body.results.uuid;
    onTestFinished(async () => {
        await admin.delete(`${project}/spaces/${spaceUuid}`);
    });
    await admin.patch(`${project}/spaces/${spaceUuid}`, {
        name: spaceName,
        colorPaletteUuid,
    });

    const dashboardName = uniqueName('Directly shared dashboard');
    const dashboard = await admin.post<Body<Dashboard>>(
        `${project}/dashboards`,
        { ...dashboardMock, name: dashboardName, spaceUuid },
    );
    const dashboardUuid = dashboard.body.results.uuid;
    const chart = await admin.post<Body<SavedChart>>(`${project}/saved`, {
        ...chartMock,
        name: uniqueName('Dashboard-owned chart'),
        dashboardUuid,
        spaceUuid: null,
    } satisfies CreateChartInDashboard);
    const chartUuid = chart.body.results.uuid;

    await admin.put(
        `${projectV2}/direct-access/dashboard/${dashboardUuid}/assignments/user/${SEED_ORG_1_VIEWER.user_uuid}`,
        { role: SpaceMemberRole.VIEWER },
    );
    const viewer = await loginAsViewer();
    const chartPaletteUrl = `${project}/colorPalette?chartUuid=${chartUuid}`;
    const inherited =
        await viewer.get<ApiProjectColorPaletteResponse>(chartPaletteUrl);
    expect(inherited.body.results).toMatchObject({
        paletteUuid: colorPaletteUuid,
        paletteName,
        colors,
        source: { type: 'space', uuid: spaceUuid, name: spaceName },
    });

    await admin.patch(`${projectV2}/dashboards/${dashboardUuid}`, {
        name: dashboardName,
        colorPaletteUuid,
    });
    const inDashboard = await viewer.get<ApiProjectColorPaletteResponse>(
        `${chartPaletteUrl}&dashboardUuid=${dashboardUuid}`,
    );
    expect(inDashboard.body.results).toMatchObject({
        paletteUuid: colorPaletteUuid,
        paletteName,
        colors,
        source: { type: 'dashboard', uuid: dashboardUuid, name: dashboardName },
    });
});
