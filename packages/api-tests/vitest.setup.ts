import { beforeAll } from 'vitest';
import { fetchWithConnectionRetry, SITE_URL } from './helpers/api-client';

beforeAll(async () => {
    const resp = await fetchWithConnectionRetry(`${SITE_URL}/api/v1/health`);
    if (!resp.ok) {
        throw new Error(
            `Server health check failed (${resp.status}). Is the dev server running at ${SITE_URL}?`,
        );
    }
});
