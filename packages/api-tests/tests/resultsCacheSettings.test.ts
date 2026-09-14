import {
    FeatureFlags,
    MAX_RESULTS_CACHE_TTL_SECONDS,
    MIN_RESULTS_CACHE_TTL_SECONDS,
    SEED_PROJECT,
    type ResultsCacheProjectSettings,
} from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, type Body } from '../helpers/api-client';
import { login, loginAsViewer } from '../helpers/auth';

const settingsUrl = `/api/v1/projects/${SEED_PROJECT.project_uuid}/results-cache-config`;
const flagOverrideUrl = `/api/v2/feature-flag/${FeatureFlags.ResultsCacheEnabled}`;

describe('Project results cache settings', () => {
    let admin: ApiClient;
    let viewer: ApiClient;

    beforeAll(async () => {
        admin = await login();
        viewer = await loginAsViewer();
        // PATCH is gated on results caching; enable it for the org
        await admin.post(flagOverrideUrl, { enabled: true });
    });

    afterAll(async () => {
        await admin.patch(settingsUrl, { cacheTtlSeconds: null });
        await admin.delete(flagOverrideUrl);
    });

    it('defaults to the instance TTL', async () => {
        const resp =
            await admin.get<Body<ResultsCacheProjectSettings>>(settingsUrl);
        expect(resp.status).toBe(200);
        expect(resp.body.results).toEqual({
            projectUuid: SEED_PROJECT.project_uuid,
            cacheTtlSeconds: null,
            instanceDefaultTtlSeconds: expect.any(Number),
        });
        expect(resp.body.results.instanceDefaultTtlSeconds).toBeGreaterThan(0);
    });

    it('persists a project TTL and clears it back to the default', async () => {
        const updated = await admin.patch<Body<ResultsCacheProjectSettings>>(
            settingsUrl,
            { cacheTtlSeconds: 1800 },
        );
        expect(updated.status).toBe(200);
        expect(updated.body.results.cacheTtlSeconds).toBe(1800);

        const persisted =
            await admin.get<Body<ResultsCacheProjectSettings>>(settingsUrl);
        expect(persisted.body.results.cacheTtlSeconds).toBe(1800);

        const cleared = await admin.patch<Body<ResultsCacheProjectSettings>>(
            settingsUrl,
            { cacheTtlSeconds: null },
        );
        expect(cleared.body.results.cacheTtlSeconds).toBeNull();
    });

    it.each([
        ['below the minimum', MIN_RESULTS_CACHE_TTL_SECONDS - 1],
        ['above the maximum', MAX_RESULTS_CACHE_TTL_SECONDS + 1],
        ['not a whole number', 90.5],
    ])('rejects a TTL %s', async (_label, cacheTtlSeconds) => {
        const resp = await admin.patch(
            settingsUrl,
            { cacheTtlSeconds },
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(400);
    });

    it('is not readable or writable by a viewer', async () => {
        const read = await viewer.get(settingsUrl, { failOnStatusCode: false });
        expect(read.status).toBe(403);

        const write = await viewer.patch(
            settingsUrl,
            { cacheTtlSeconds: 1800 },
            { failOnStatusCode: false },
        );
        expect(write.status).toBe(403);
    });
});
