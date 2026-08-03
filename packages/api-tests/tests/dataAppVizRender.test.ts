import {
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
import { login } from '../helpers/auth';

const embedApiPrefix = `/api/v1/embed/${SEED_PROJECT.project_uuid}`;

const renderBaseUrl = (dataAppVizUuid: string) =>
    `/api/v1/ee/projects/${SEED_PROJECT.project_uuid}/apps/visualizations/${dataAppVizUuid}`;

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

describe('Data app visualization render endpoints', () => {
    let admin: ApiClient;
    let nonVisualizationDataAppUuid: string | null = null;

    beforeAll(async () => {
        admin = await login();
        nonVisualizationDataAppUuid =
            await createNonVisualizationDataApp(admin);
    });

    afterAll(async () => {
        if (nonVisualizationDataAppUuid !== null) {
            await deleteDataApp(admin, nonVisualizationDataAppUuid);
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

        const chartsResponse = await admin.get<Body<Array<{ uuid: string }>>>(
            `/api/v1/projects/${SEED_PROJECT.project_uuid}/charts`,
        );
        expect(chartsResponse.status).toBe(200);
        const [savedChart] = chartsResponse.body.results;
        if (!savedChart) {
            throw new Error('Expected the seed project to contain a chart');
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
