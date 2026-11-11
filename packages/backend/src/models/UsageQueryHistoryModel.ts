import { ProjectType, QueryHistoryStatus } from '@lightdash/common';
import type { Knex } from 'knex';
import {
    MAX_ERROR_CHARACTERS,
    truncateQueryError,
} from '../analytics/eventStream/queryError';
import { queryEventsCompactedColumns } from '../analytics/eventStream/queryEventsStream';
import { QUERY_HISTORY_BACKFILL_EVENT } from '../analytics/eventStream/queryHistoryBackfill';
import { queryHistoryRequestColumnSql } from '../database/entities/queryHistory';
import { isStatementTimeout } from '../database/errors';

const HISTORY_WINDOW_MS = 60 * 60 * 1000;

/** Only fields retained by query_history; never infer completion time or latency. */
export class UsageQueryHistoryModel {
    constructor(private readonly database: Knex) {}

    async *getJsonLines(
        organizationUuid: string,
        before: string,
    ): AsyncGenerator<string> {
        const oldest = await this.database.transaction(async (trx) => {
            await trx.raw('SET TRANSACTION READ ONLY');
            await trx.raw("SET LOCAL TIME ZONE 'UTC'");
            await trx.raw("SET LOCAL statement_timeout = '10s'");
            await trx.raw("SET LOCAL lock_timeout = '1s'");
            return trx('query_history')
                .select(
                    trx.raw("min(??) AT TIME ZONE 'UTC' AS ??", [
                        'created_at',
                        'created_at',
                    ]),
                )
                .first<{ created_at: Date | null }>();
        });
        if (!oldest?.created_at) return;
        // Only the scan boundary is global; every exported row is org-scoped.
        let windowStart =
            Math.floor(oldest.created_at.getTime() / HISTORY_WINDOW_MS) *
            HISTORY_WINDOW_MS;
        const cutoff = new Date(before).getTime();
        while (windowStart <= cutoff) {
            let windowEnd = Math.min(windowStart + HISTORY_WINDOW_MS, cutoff);
            let cursor: { createdAt: string; queryUuid: string } | undefined;
            while (true) {
                const query = this.database('query_history as q')
                    .join('projects as p', 'p.project_uuid', 'q.project_uuid')
                    .join(
                        'organizations as o',
                        'o.organization_id',
                        'p.organization_id',
                    )
                    .where('q.organization_uuid', organizationUuid)
                    .where('o.organization_uuid', organizationUuid)
                    .whereNot('p.project_type', ProjectType.PREVIEW)
                    .where(
                        'q.created_at',
                        '>=',
                        new Date(windowStart).toISOString(),
                    )
                    .where(
                        'q.created_at',
                        '<',
                        windowEnd === cutoff
                            ? before
                            : new Date(windowEnd).toISOString(),
                    )
                    .whereIn('q.status', [
                        QueryHistoryStatus.READY,
                        QueryHistoryStatus.ERROR,
                    ])
                    .select(
                        'q.query_uuid',
                        'q.project_uuid',
                        'q.created_by_user_uuid',
                        'q.context',
                        'q.status',
                        'q.warehouse_execution_time_ms',
                        'q.total_row_count',
                    )
                    .select(
                        this.database.raw('LEFT(??, ?) AS ??', [
                            'q.error',
                            MAX_ERROR_CHARACTERS + 1,
                            'error',
                        ]),
                    )
                    .select(
                        this.database.raw(
                            'to_char(q.created_at, \'YYYY-MM-DD"T"HH24:MI:SS.US"Z"\') as event_ts',
                        ),
                    )
                    .select(
                        this.database.raw(
                            "q.metric_query->>'exploreName' as explore_name",
                        ),
                    )
                    .select(
                        this.database.raw(
                            `COALESCE(${queryHistoryRequestColumnSql('q', 'request_chart_uuid')}, ${queryHistoryRequestColumnSql('q', 'request_saved_sql_uuid')}) as chart_id`,
                        ),
                    )
                    .select(
                        this.database.raw(
                            `${queryHistoryRequestColumnSql('q', 'request_dashboard_uuid')} as dashboard_id`,
                        ),
                    )
                    .orderBy('q.created_at')
                    .orderBy('q.query_uuid')
                    .limit(1000);
                if (cursor)
                    query.whereRaw('(??, ??) > (?, ?)', [
                        'q.created_at',
                        'q.query_uuid',
                        cursor.createdAt,
                        cursor.queryUuid,
                    ]);
                // Release the DB connection between pages and storage work.
                let rows: Awaited<typeof query> | null = null;
                try {
                    // eslint-disable-next-line no-await-in-loop
                    rows = await this.database.transaction(async (trx) => {
                        await trx.raw('SET TRANSACTION READ ONLY');
                        await trx.raw("SET LOCAL TIME ZONE 'UTC'");
                        await trx.raw("SET LOCAL statement_timeout = '10s'");
                        await trx.raw("SET LOCAL lock_timeout = '1s'");
                        return query.transacting(trx);
                    });
                } catch (error) {
                    const remainingStart = cursor
                        ? new Date(cursor.createdAt).getTime()
                        : windowStart;
                    if (
                        !isStatementTimeout(error) ||
                        windowEnd - remainingStart <= 1
                    )
                        throw error;
                    windowEnd =
                        remainingStart +
                        Math.ceil((windowEnd - remainingStart) / 2);
                }
                if (rows !== null) {
                    if (!rows.length) break;
                    for (const row of rows) {
                        yield `${JSON.stringify({
                            ...Object.fromEntries(
                                queryEventsCompactedColumns.map(({ name }) => [
                                    name,
                                    null,
                                ]),
                            ),
                            event_name: QUERY_HISTORY_BACKFILL_EVENT,
                            schema_version: 1,
                            org_id: organizationUuid,
                            project_id: row.project_uuid,
                            query_id: row.query_uuid,
                            user_id: row.created_by_user_uuid,
                            event_ts: row.event_ts,
                            status:
                                row.status === QueryHistoryStatus.READY
                                    ? 'success'
                                    : 'error',
                            error:
                                row.status === QueryHistoryStatus.ERROR
                                    ? truncateQueryError(row.error)
                                    : null,
                            context: row.context,
                            explore_name: row.explore_name,
                            chart_id: row.chart_id,
                            dashboard_id: row.dashboard_id,
                            warehouse_execution_time_ms:
                                row.warehouse_execution_time_ms,
                            total_row_count: row.total_row_count,
                        })}\n`;
                    }
                    const last = rows[rows.length - 1];
                    // Preserve Postgres microseconds; a JavaScript Date loses precision.
                    cursor = {
                        createdAt: last.event_ts,
                        queryUuid: last.query_uuid,
                    };
                }
            }
            if (windowEnd === cutoff) return;
            windowStart = windowEnd;
        }
    }
}
