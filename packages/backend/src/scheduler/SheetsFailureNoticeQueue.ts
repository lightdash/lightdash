import { SCHEDULER_TASKS, type SheetsFailureNotice } from '@lightdash/common';
import { type Knex } from 'knex';

export async function enqueueSheetsFailureNotice(
    database: Knex,
    notice: SheetsFailureNotice,
): Promise<void> {
    const { schedulerUuid, event } = notice;
    const eventKey = `paused:${event.scheduledTime}`;
    // Use the same transaction as the pause. Each transport retries independently.
    await database.raw(
        `SELECT graphile_worker.add_job(
            ?, (?::jsonb || jsonb_build_object('channel', channel))::json,
            max_attempts => 6, job_key => (? || channel), job_key_mode => 'unsafe_dedupe'
        ) FROM unnest(ARRAY['email', 'slack']) AS channels(channel)`,
        [
            SCHEDULER_TASKS.NOTIFY_SHEETS_FAILURE,
            JSON.stringify(notice),
            `sheets-notice:${schedulerUuid}:${eventKey}:`,
        ],
    );
}
