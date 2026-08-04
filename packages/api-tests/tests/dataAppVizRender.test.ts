import {
    SEED_PROJECT,
    type ApiError,
    type ApiImportAppCodeResponse,
    type DataAppCode,
} from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import { ApiClient } from '../helpers/api-client';
import { login } from '../helpers/auth';

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
