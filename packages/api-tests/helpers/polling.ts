import { ApiClient } from './api-client';

type PollOptions<T> = {
    /** Maximum time in ms to keep polling (default: 30000) */
    timeout?: number;
    /** Interval in ms between polls (default: 1000) */
    interval?: number;
    /** Predicate that returns true when the condition is met */
    condition: (body: T) => boolean;
};

/**
 * Poll a URL until a condition is met or timeout is reached.
 */
export async function pollUntil<T = unknown>(
    client: ApiClient,
    url: string,
    options: PollOptions<T>,
): Promise<T> {
    const { timeout = 30_000, interval = 1_000, condition } = options;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
        const resp = await client.get<T>(url, { failOnStatusCode: false });
        if (resp.ok && condition(resp.body)) {
            return resp.body;
        }
        await new Promise<void>((resolve) => {
            setTimeout(resolve, interval);
        });
    }

    throw new Error(`pollUntil timed out after ${timeout}ms for ${url}`);
}

/**
 * Wait for a job to complete by polling its status endpoint.
 */
export async function waitForJobCompletion(
    client: ApiClient,
    jobId: string,
    timeout = 60_000,
): Promise<unknown> {
    return pollUntil(client, `/api/v1/schedulers/job/${jobId}/status`, {
        timeout,
        interval: 1_000,
        condition: (body: unknown) => {
            const status = (body as { results?: { status?: string } })?.results
                ?.status;
            if (status === 'error') {
                throw new Error(`Job ${jobId} failed: ${JSON.stringify(body)}`);
            }
            return status === 'completed';
        },
    });
}
