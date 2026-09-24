import { fetchWithConnectionRetry, SITE_URL } from './api-client';

const HEALTH_TIMEOUT_MS = 180_000;
const HEALTH_POLL_INTERVAL_MS = 3_000;
const HEALTH_REQUEST_TIMEOUT_MS = 10_000;

export default async function waitForServerHealth(
    url = `${SITE_URL}/api/v1/health`,
    timeoutMs = HEALTH_TIMEOUT_MS,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastFailure = 'no response';

    while (Date.now() < deadline) {
        const remainingMs = deadline - Date.now();
        try {
            const response = await fetchWithConnectionRetry(url, {
                signal: AbortSignal.timeout(
                    Math.min(HEALTH_REQUEST_TIMEOUT_MS, remainingMs),
                ),
            });
            if (response.ok) return;
            lastFailure = `HTTP ${response.status}`;
        } catch (error) {
            lastFailure = String(error);
        }

        const pauseMs = Math.min(
            HEALTH_POLL_INTERVAL_MS,
            deadline - Date.now(),
        );
        if (pauseMs > 0) {
            await new Promise<void>((resolve) => {
                setTimeout(resolve, pauseMs);
            });
        }
    }

    throw new Error(
        `Server health check failed after ${timeoutMs}ms at ${url} (${lastFailure}). Rerun the whole workflow.`,
    );
}
