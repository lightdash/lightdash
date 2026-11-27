import { SCHEDULER_TASKS, type BigQueryTableNotice } from '@lightdash/common';
import { type Knex } from 'knex';

export async function enqueueBigQueryTableNotice(
    database: Knex,
    notice: BigQueryTableNotice,
): Promise<void> {
    const { schedulerUuid, event } = notice;
    const eventKey =
        event.type === 'paused'
            ? `paused:${event.scheduledTime}`
            : `attempt:${event.jobId}:${event.attempt}`;
    // Use the same transaction as the pause. Each transport retries independently.
    await database.raw(
        `SELECT graphile_worker.add_job(
            ?, (?::jsonb || jsonb_build_object('channel', channel))::json,
            max_attempts => 6, job_key => (? || channel), job_key_mode => 'unsafe_dedupe'
        ) FROM unnest(ARRAY['email', 'slack']) AS channels(channel)`,
        [
            SCHEDULER_TASKS.NOTIFY_BIGQUERY_TABLE_FAILURE,
            JSON.stringify(notice),
            `bigquery-notice:${schedulerUuid}:${eventKey}:`,
        ],
    );
}
