import { SCHEDULER_TASKS } from '@lightdash/common';
import { parseArgs } from 'node:util';
import { Client } from 'pg';
import type { LightdashConfig } from '../config/parseConfig';

/** Enqueue the normal worker task; never run a second compactor outside its queue. */
export async function enqueueUsageEventsCompaction(config: LightdashConfig) {
    if (!config.usageEvents.enabled || !config.usageEvents.s3) {
        throw new Error('Usage events must be enabled and storage configured');
    }
    const client = new Client({
        connectionString: config.database.connectionUri,
        connectionTimeoutMillis: 10_000,
        statement_timeout: 10_000,
    });
    try {
        await client.connect();
        const { rows } = await client.query<{ id: string }>(
            `SELECT id FROM graphile_worker.add_job(
                identifier := $1,
                payload := '{}'::json,
                queue_name := 'usage-events-compaction',
                max_attempts := 3,
                job_key := 'manual-usage-events-compaction',
                job_key_mode := 'preserve_run_at'
            )`,
            [SCHEDULER_TASKS.COMPACT_USAGE_EVENTS],
        );
        return rows[0].id;
    } finally {
        await client.end();
    }
}

async function main() {
    const { values } = parseArgs({
        options: {
            enqueue: { type: 'boolean' },
            help: { type: 'boolean' },
        },
    });
    if (values.help || !values.enqueue) {
        console.log(
            'compact-usage-events --enqueue\nQueues the normal compaction job for all closed UTC days in this deployment. Uses its configured database and usage storage. Requires a running scheduler with the intended release. Queuing is not proof of successful compaction; inspect worker logs for failures and deferred user summaries.',
        );
        return;
    }
    const { lightdashConfig } = await import('../config/lightdashConfig');
    const id = await enqueueUsageEventsCompaction(lightdashConfig);
    console.log(
        `Queued usage compaction job ${id}; inspect worker logs for completion.`,
    );
}

if (require.main === module) {
    void main().catch(() => {
        // Configuration/connection errors can include credentials.
        console.error(
            'Could not enqueue usage compaction. Check arguments (--help), usage-events configuration and database access.',
        );
        process.exitCode = 1;
    });
}
