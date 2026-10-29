import { SCHEDULER_TASKS } from '@lightdash/common';
import type { JobHelpers } from 'graphile-worker';

export const USAGE_LEASE_RENEWAL_MS = 60_000;
const RENEWAL_DEADLINE_MS = 15_000;

/** Graphile Worker 0.13 does not heartbeat its four-hour job/queue leases. */
export const renewUsageProcessingLease = async (
    helpers: Pick<JobHelpers, 'job' | 'withPgClient'>,
): Promise<void> => {
    const { job } = helpers;
    if (
        job.task_identifier !== SCHEDULER_TASKS.COMPACT_USAGE_EVENTS ||
        job.queue_name !== 'usage-events-compaction' ||
        !job.locked_by
    ) {
        throw new Error('Usage processing requires an owned compaction queue');
    }
    await helpers.withPgClient(async (client) => {
        await client.query('BEGIN');
        try {
            await client.query("SET LOCAL statement_timeout = '10s'");
            await client.query("SET LOCAL lock_timeout = '5s'");
            // Lock the queue first, matching get_job's queue eligibility check.
            // Both timestamps change atomically, only while both owners match.
            const result = await client.query(
                `WITH owned_queue AS (
                    SELECT queue_name FROM graphile_worker.job_queues
                    WHERE queue_name = $3 AND locked_by = $2
                    FOR UPDATE
                ), owned_job AS (
                    UPDATE graphile_worker.jobs SET locked_at = now()
                    WHERE id = $1 AND locked_by = $2 AND queue_name = $3
                      AND EXISTS (SELECT 1 FROM owned_queue)
                    RETURNING id
                )
                UPDATE graphile_worker.job_queues SET locked_at = now()
                WHERE queue_name = $3 AND locked_by = $2
                  AND EXISTS (SELECT 1 FROM owned_job)
                RETURNING queue_name`,
                [job.id, job.locked_by, job.queue_name],
            );
            if (result.rowCount !== 1) {
                throw new Error('Usage processing lost its job or queue lease');
            }
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
    });
};

export const withUsageProcessingLease = async <T>(
    helpers: Pick<JobHelpers, 'job' | 'withPgClient'>,
    run: (signal: AbortSignal) => Promise<T>,
): Promise<T> => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let renewal: Promise<void> | undefined;
    let stopped = false;
    const renew = async () => {
        const deadline = setTimeout(() => {
            controller.abort(
                new Error('Usage processing lease renewal timed out'),
            );
        }, RENEWAL_DEADLINE_MS);
        deadline.unref();
        try {
            await renewUsageProcessingLease(helpers);
        } catch (error) {
            controller.abort(error);
        } finally {
            clearTimeout(deadline);
        }
        controller.signal.throwIfAborted();
    };
    const schedule = () => {
        timer = setTimeout(() => {
            renewal = renew()
                .then(() => {
                    if (!stopped) schedule();
                })
                .catch(() => {
                    // The shared signal interrupts in-flight work. Await it below;
                    // never release the Graphile job while its pipeline still runs.
                });
        }, USAGE_LEASE_RENEWAL_MS);
        timer.unref();
    };
    await renew();
    schedule();
    try {
        const result = await run(controller.signal);
        stopped = true;
        clearTimeout(timer);
        // A delayed timer must not turn lost ownership into successful completion.
        await renewal;
        await renew();
        controller.signal.throwIfAborted();
        return result;
    } finally {
        stopped = true;
        clearTimeout(timer);
        await renewal;
        controller.signal.throwIfAborted();
        // Graphile owns completion/failure and releases only its matching queue.
        // We never clear or steal locks here, including after ownership loss.
    }
};
