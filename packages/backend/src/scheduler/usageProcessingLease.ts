import { SCHEDULER_TASKS } from '@lightdash/common';
import type { JobHelpers } from 'graphile-worker';

/** Graphile 0.13 has a fixed four-hour expiry and no per-task lease option. */
export const extendUsageProcessingLease = async ({
    job,
    withPgClient,
}: Pick<JobHelpers, 'job' | 'withPgClient'>): Promise<void> => {
    if (
        job.task_identifier !== SCHEDULER_TASKS.COMPACT_USAGE_EVENTS ||
        job.queue_name !== 'usage-events-compaction' ||
        !job.locked_by
    ) {
        throw new Error('Usage processing requires an owned compaction queue');
    }
    // Eight hours forward + Graphile's four-hour expiry = twelve hours total.
    // Normal completion/failure still releases immediately; crashes wait for expiry.
    // Update both owned rows atomically, locking the queue first as get_job does.
    const result = await withPgClient((client) =>
        client.query(
            `WITH owned_queue AS (
                SELECT queue_name FROM graphile_worker.job_queues
                WHERE queue_name = $3 AND locked_by = $2
                FOR UPDATE
            ), owned_job AS (
                UPDATE graphile_worker.jobs
                SET locked_at = now() + interval '8 hours'
                WHERE id = $1 AND locked_by = $2 AND queue_name = $3
                  AND EXISTS (SELECT 1 FROM owned_queue)
                RETURNING id
            )
            UPDATE graphile_worker.job_queues
            SET locked_at = now() + interval '8 hours'
            WHERE queue_name = $3 AND locked_by = $2
              AND EXISTS (SELECT 1 FROM owned_job)
            RETURNING queue_name`,
            [job.id, job.locked_by, job.queue_name],
        ),
    );
    if (result.rowCount !== 1) {
        throw new Error('Usage processing lost its job or queue lease');
    }
};
