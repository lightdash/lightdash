import {
    type ApiOrganizationSettingsResponse,
    type UpdateOrganizationSettings,
} from '@lightdash/common';
import { SITE_URL } from '../helpers/api-client';
import { login } from '../helpers/auth';

const getCorsResponse = async (origin: string): Promise<Response> =>
    fetch(`${SITE_URL}/api/v1/health`, {
        headers: { Origin: origin },
    });

describe('CORS policy', () => {
    let admin: Awaited<ReturnType<typeof login>>;
    let originalCorsAllowedDomains: string[] = [];

    beforeAll(async () => {
        admin = await login();
        const originalSettings =
            await admin.get<ApiOrganizationSettingsResponse>(
                '/api/v1/org/settings',
            );
        expect(originalSettings.status).toBe(200);
        originalCorsAllowedDomains =
            originalSettings.body.results.corsAllowedDomains ?? [];
    });

    afterAll(async () => {
        if (!admin) {
            return;
        }

        await admin.patch<ApiOrganizationSettingsResponse>(
            '/api/v1/org/settings',
            {
                corsAllowedDomains: originalCorsAllowedDomains,
            } satisfies UpdateOrganizationSettings,
        );
    });

    it('uses updated org CORS settings immediately after invalidating the cache', async () => {
        const runId = Date.now();
        const exactOrigin = `https://cors-exact-${runId}.example.com`;
        const regexOrigin = `https://app.cors-regex-${runId}.example.com`;
        const unknownOrigin = `https://unknown-cors-${runId}.example.com`;
        const regexPattern = `/^https:\\/\\/.*\\.cors-regex-${runId}\\.example\\.com$/`;

        const warmCacheResponse = await getCorsResponse(exactOrigin);
        expect(warmCacheResponse.status).toBe(200);
        expect(
            warmCacheResponse.headers.get('access-control-allow-origin'),
        ).toBeNull();

        const updateSettings =
            await admin.patch<ApiOrganizationSettingsResponse>(
                '/api/v1/org/settings',
                {
                    corsAllowedDomains: [exactOrigin, regexPattern],
                } satisfies UpdateOrganizationSettings,
            );
        expect(updateSettings.status).toBe(200);
        expect(updateSettings.body.results.corsAllowedDomains).toEqual([
            exactOrigin,
            regexPattern,
        ]);

        const exactResponse = await getCorsResponse(exactOrigin);
        expect(exactResponse.status).toBe(200);
        expect(exactResponse.headers.get('access-control-allow-origin')).toBe(
            exactOrigin,
        );

        const regexResponse = await getCorsResponse(regexOrigin);
        expect(regexResponse.status).toBe(200);
        expect(regexResponse.headers.get('access-control-allow-origin')).toBe(
            regexOrigin,
        );

        const unknownResponse = await getCorsResponse(unknownOrigin);
        expect(unknownResponse.status).toBe(200);
        expect(
            unknownResponse.headers.get('access-control-allow-origin'),
        ).toBeNull();

        const secondExactResponse = await getCorsResponse(exactOrigin);
        expect(secondExactResponse.status).toBe(200);
        expect(
            secondExactResponse.headers.get('access-control-allow-origin'),
        ).toBe(exactOrigin);

        const removeSettings =
            await admin.patch<ApiOrganizationSettingsResponse>(
                '/api/v1/org/settings',
                {
                    corsAllowedDomains: [],
                } satisfies UpdateOrganizationSettings,
            );
        expect(removeSettings.status).toBe(200);
        expect(removeSettings.body.results.corsAllowedDomains).toEqual([]);

        const removedExactResponse = await getCorsResponse(exactOrigin);
        expect(removedExactResponse.status).toBe(200);
        expect(
            removedExactResponse.headers.get('access-control-allow-origin'),
        ).toBeNull();
    });
});
