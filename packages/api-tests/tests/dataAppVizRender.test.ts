import {
    SEED_DATA_APP_VIZ,
    SEED_ORG_1,
    SEED_PROJECT,
    type ApiError,
    type ApiImportAppCodeResponse,
    type CreateEmbedJwt,
    type DataAppCode,
    type DecodedEmbed,
    type UpdateEmbed,
} from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import { ApiClient, type Body } from '../helpers/api-client';
import {
    login,
    loginAsViewer,
    loginWithEmail,
    loginWithPermissions,
} from '../helpers/auth';

const embedApiPrefix = `/api/v1/embed/${SEED_PROJECT.project_uuid}`;

const renderBaseUrl = (dataAppVizUuid: string) =>
    `/api/v1/ee/projects/${SEED_PROJECT.project_uuid}/apps/visualizations/${dataAppVizUuid}`;

const chartRenderBaseUrl = (savedChartUuid: string, dataAppVizUuid: string) =>
    `/api/v1/ee/projects/${SEED_PROJECT.project_uuid}/apps/visualizations/${dataAppVizUuid}/charts/${savedChartUuid}`;

const appsBaseUrl = `/api/v1/ee/projects/${SEED_PROJECT.project_uuid}/apps`;

const createNonVisualizationDataApp = async (
    client: ApiClient,
): Promise<string> => {
    const code: DataAppCode = {
        manifest: {
            codeVersion: 1,
            projectUuid: SEED_PROJECT.project_uuid,
            version: 1,
            name: `Viz endpoint isolation ${randomUUID()}`,
            description:
                'Non-visualization data app used by API isolation tests',
            template: null,
            downloadedAt: new Date().toISOString(),
        },
        files: [
            {
                path: 'src/App.tsx',
                contentBase64: Buffer.from(
                    'export default function App() { return null; }',
                ).toString('base64'),
            },
        ],
    };
    const response = await client.post<ApiImportAppCodeResponse>(
        `${appsBaseUrl}/upload`,
        { code, createNew: true },
    );

    expect(response.status).toBe(200);
    return response.body.results.appUuid;
};

const deleteDataApp = (client: ApiClient, appUuid: string) =>
    client.delete(`${appsBaseUrl}/${appUuid}`);

const embedRenderBaseUrl = (savedChartUuid: string, dataAppVizUuid: string) =>
    `${embedApiPrefix}/chart/${savedChartUuid}/visualizations/${dataAppVizUuid}`;

const getEmbedConfig = (client: ApiClient) =>
    client.get<Body<DecodedEmbed>>(`${embedApiPrefix}/config`, {
        failOnStatusCode: false,
    });

const updateEmbedConfig = (client: ApiClient, body: UpdateEmbed) =>
    client.patch<Body<unknown>>(`${embedApiPrefix}/config`, body);

const getEmbedUrl = (client: ApiClient, body: CreateEmbedJwt) =>
    client.post<Body<{ url: string }>>(`${embedApiPrefix}/get-embed-url`, body);

type CustomRoleFixture = {
    client: ApiClient;
    roleUuid: string;
    userUuid: string;
};

const createCustomRoleUser = async (
    admin: ApiClient,
    roleName: string,
    scopes: string[],
): Promise<CustomRoleFixture> => {
    const roleResponse = await admin.post<Body<{ roleUuid: string }>>(
        `/api/v2/orgs/${SEED_ORG_1.organization_uuid}/roles`,
        {
            name: `${roleName} ${randomUUID()}`,
            description: 'Data app visualization render permission test role',
            scopes,
        },
    );
    expect(roleResponse.status).toBe(201);

    const { client, email } = await loginWithPermissions('member', []);
    const userResponse =
        await client.get<Body<{ userUuid: string }>>('/api/v1/user');
    expect(userResponse.status).toBe(200);

    const assignmentResponse = await admin.post(
        `/api/v2/projects/${SEED_PROJECT.project_uuid}/roles/assignments/user/${userResponse.body.results.userUuid}`,
        { roleId: roleResponse.body.results.roleUuid },
    );
    expect(assignmentResponse.status).toBe(200);

    return {
        client: await loginWithEmail(email),
        roleUuid: roleResponse.body.results.roleUuid,
        userUuid: userResponse.body.results.userUuid,
    };
};

const deleteCustomRoleUser = async (
    admin: ApiClient,
    fixture: CustomRoleFixture,
) => {
    await admin.delete(
        `/api/v2/projects/${SEED_PROJECT.project_uuid}/roles/assignments/user/${fixture.userUuid}`,
        { failOnStatusCode: false },
    );
    await admin.delete(
        `/api/v2/orgs/${SEED_ORG_1.organization_uuid}/roles/${fixture.roleUuid}`,
        { failOnStatusCode: false },
    );
};

describe('Data app visualization render endpoints', () => {
    let admin: ApiClient;
    let viewer: ApiClient;
    let savedChartRoleUser: CustomRoleFixture;
    let dataAppRoleUser: CustomRoleFixture;
    let savedChartUuid: string;
    let nonVisualizationDataAppUuid: string | null = null;

    beforeAll(async () => {
        admin = await login();
        viewer = await loginAsViewer();
        nonVisualizationDataAppUuid =
            await createNonVisualizationDataApp(admin);

        const chartsResponse = await admin.get<
            Body<Array<{ uuid: string; name: string }>>
        >(`/api/v1/projects/${SEED_PROJECT.project_uuid}/charts`);
        expect(chartsResponse.status).toBe(200);
        const savedChart = chartsResponse.body.results.find(
            ({ name }) => name === SEED_DATA_APP_VIZ.chartName,
        );
        if (!savedChart) {
            throw new Error('Expected the seeded data app visualization chart');
        }
        savedChartUuid = savedChart.uuid;

        savedChartRoleUser = await createCustomRoleUser(
            admin,
            'View saved charts',
            ['view:SavedChart'],
        );
        dataAppRoleUser = await createCustomRoleUser(
            admin,
            'View data apps only',
            ['view:DataApp'],
        );
    });

    afterAll(async () => {
        await deleteCustomRoleUser(admin, savedChartRoleUser);
        await deleteCustomRoleUser(admin, dataAppRoleUser);
        if (nonVisualizationDataAppUuid !== null) {
            await deleteDataApp(admin, nonVisualizationDataAppUuid);
        }
    });

    // The chart-scoped route must track saved-chart access exactly.
    const expectAccessLikeSavedChart = async (
        client: ApiClient,
        expectedStatus: number,
    ) => {
        const savedChartResponse = await client.get(
            `/api/v1/saved/${savedChartUuid}`,
            { failOnStatusCode: false },
        );
        expect(savedChartResponse.status).toBe(expectedStatus);

        for (const path of [
            'render-metadata',
            `versions/${SEED_DATA_APP_VIZ.version}/preview-token`,
        ]) {
            const renderResponse = await client.get(
                `${chartRenderBaseUrl(
                    savedChartUuid,
                    SEED_DATA_APP_VIZ.appUuid,
                )}/${path}`,
                { failOnStatusCode: false },
            );
            expect(renderResponse.status).toBe(expectedStatus);
        }
    };

    it('lets a viewer render a visualization just like viewing its saved chart', async () => {
        await expectAccessLikeSavedChart(viewer, 200);
    });

    it('uses view:SavedChart rather than view:DataApp on the chart route', async () => {
        await expectAccessLikeSavedChart(savedChartRoleUser.client, 200);
        await expectAccessLikeSavedChart(dataAppRoleUser.client, 403);
    });

    it('keeps the chart-less authoring preview at editor-plus', async () => {
        for (const path of [
            'render-metadata',
            `versions/${SEED_DATA_APP_VIZ.version}/preview-token`,
        ]) {
            const url = `${renderBaseUrl(SEED_DATA_APP_VIZ.appUuid)}/${path}`;
            expect(
                (await admin.get(url, { failOnStatusCode: false })).status,
            ).toBe(200);
            expect(
                (await viewer.get(url, { failOnStatusCode: false })).status,
            ).toBe(403);
        }
    });

    it.each(['render-metadata', 'versions/1/preview-token'])(
        'returns a generic 404 for an unknown visualization on %s',
        async (path) => {
            const dataAppVizUuid = randomUUID();
            const response = await admin.get<ApiError>(
                `${renderBaseUrl(dataAppVizUuid)}/${path}`,
                { failOnStatusCode: false },
            );

            expect(response.status).toBe(404);
            expect(response.body.error.message).toBe(
                'Data app visualization not found',
            );
            expect(response.body.error.message).not.toContain(dataAppVizUuid);
        },
    );

    it.each(['render-metadata', 'versions/1/preview-token'])(
        'returns a generic 404 for a non-visualization data app on %s',
        async (path) => {
            if (nonVisualizationDataAppUuid === null) {
                throw new Error(
                    'Expected a non-visualization data app fixture',
                );
            }
            const response = await admin.get<ApiError>(
                `${renderBaseUrl(nonVisualizationDataAppUuid)}/${path}`,
                { failOnStatusCode: false },
            );

            expect(response.status).toBe(404);
            expect(response.body.error.message).toBe(
                'Data app visualization not found',
            );
            expect(response.body.error.message).not.toContain(
                nonVisualizationDataAppUuid,
            );
        },
    );

    it('requires registered authentication', async () => {
        const response = await new ApiClient().get(
            `${renderBaseUrl(randomUUID())}/render-metadata`,
            { failOnStatusCode: false },
        );

        expect(response.status).toBe(401);
    });
});

describe('Embedded data app visualization render endpoints', () => {
    let admin: ApiClient;
    let embedEnabled = true;
    let originalConfig: DecodedEmbed;
    let savedChartUuid: string;
    let embedToken: string;
    let nonVisualizationDataAppUuid: string | null = null;

    beforeAll(async () => {
        admin = await login();

        const configResponse = await getEmbedConfig(admin);
        if (configResponse.status === 403) {
            embedEnabled = false;
            return;
        }

        expect(configResponse.status).toBe(200);
        originalConfig = configResponse.body.results;
        nonVisualizationDataAppUuid =
            await createNonVisualizationDataApp(admin);

        const chartsResponse = await admin.get<
            Body<Array<{ uuid: string; name: string }>>
        >(`/api/v1/projects/${SEED_PROJECT.project_uuid}/charts`);
        expect(chartsResponse.status).toBe(200);
        const savedChart = chartsResponse.body.results.find(
            ({ name }) => name === SEED_DATA_APP_VIZ.chartName,
        );
        if (!savedChart) {
            throw new Error('Expected the seeded data app visualization chart');
        }
        savedChartUuid = savedChart.uuid;

        await updateEmbedConfig(admin, {
            dashboardUuids: originalConfig.dashboardUuids,
            allowAllDashboards: originalConfig.allowAllDashboards,
            chartUuids: [
                ...new Set([...originalConfig.chartUuids, savedChartUuid]),
            ],
            allowAllCharts: false,
        });

        const embedUrlResponse = await getEmbedUrl(admin, {
            user: {
                externalId: 'data-app-viz-render-api-test',
                email: 'data-app-viz-render-api-test@lightdash.com',
            },
            content: {
                type: 'chart',
                contentId: savedChartUuid,
                scopes: ['view:Chart'],
                canExportCsv: false,
                canExportImages: false,
                canViewUnderlyingData: false,
                projectUuid: SEED_PROJECT.project_uuid,
            },
            expiresIn: '1h',
        });
        expect(embedUrlResponse.status).toBe(200);
        const [, token] = embedUrlResponse.body.results.url.split('#');
        if (!token) throw new Error('Embed URL did not contain a token');
        embedToken = token;
    });

    beforeEach((context) => {
        if (!embedEnabled) context.skip();
    });

    afterAll(async () => {
        if (!embedEnabled) return;
        await updateEmbedConfig(admin, {
            dashboardUuids: originalConfig.dashboardUuids,
            allowAllDashboards: originalConfig.allowAllDashboards,
            chartUuids: originalConfig.chartUuids,
            allowAllCharts: originalConfig.allowAllCharts,
        });
        if (nonVisualizationDataAppUuid !== null) {
            await deleteDataApp(admin, nonVisualizationDataAppUuid);
        }
    });

    it.each([
        'render-metadata',
        `versions/${SEED_DATA_APP_VIZ.version}/preview-token`,
    ])(
        'renders the visualization referenced by the embedded chart on %s',
        async (path) => {
            const response = await new ApiClient().get(
                `${embedRenderBaseUrl(
                    savedChartUuid,
                    SEED_DATA_APP_VIZ.appUuid,
                )}/${path}`,
                {
                    headers: { 'lightdash-embed-token': embedToken },
                    failOnStatusCode: false,
                },
            );

            expect(response.status).toBe(200);
        },
    );

    it.each(['render-metadata', 'versions/1/preview-token'])(
        'returns a generic 404 for an unknown visualization on %s',
        async (path) => {
            const dataAppVizUuid = randomUUID();
            const response = await new ApiClient().get<ApiError>(
                `${embedRenderBaseUrl(savedChartUuid, dataAppVizUuid)}/${path}`,
                {
                    headers: { 'lightdash-embed-token': embedToken },
                    failOnStatusCode: false,
                },
            );

            expect(response.status).toBe(404);
            expect(response.body.error.message).toBe(
                'Data app visualization not found',
            );
            expect(response.body.error.message).not.toContain(dataAppVizUuid);
        },
    );

    it.each(['render-metadata', 'versions/1/preview-token'])(
        'returns a generic 404 for a non-visualization data app on %s',
        async (path) => {
            if (nonVisualizationDataAppUuid === null) {
                throw new Error(
                    'Expected a non-visualization data app fixture',
                );
            }
            const response = await new ApiClient().get<ApiError>(
                `${embedRenderBaseUrl(
                    savedChartUuid,
                    nonVisualizationDataAppUuid,
                )}/${path}`,
                {
                    headers: { 'lightdash-embed-token': embedToken },
                    failOnStatusCode: false,
                },
            );

            expect(response.status).toBe(404);
            expect(response.body.error.message).toBe(
                'Data app visualization not found',
            );
            expect(response.body.error.message).not.toContain(
                nonVisualizationDataAppUuid,
            );
        },
    );

    it('rejects requests without embed authentication', async () => {
        const response = await new ApiClient().get(
            `${embedRenderBaseUrl(savedChartUuid, randomUUID())}/render-metadata`,
            { failOnStatusCode: false },
        );

        expect(response.status).toBe(403);
    });
});
