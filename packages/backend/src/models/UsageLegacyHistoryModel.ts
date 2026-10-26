import { ProjectType } from '@lightdash/common';
import type { Knex } from 'knex';
import { historicalActivityColumns } from '../analytics/eventStream/usageHistorySources';

type LegacySource = {
    table: string;
    id: string;
    timestamp: string;
    user: string;
    activityType: string;
    contentType: 'chart' | 'dashboard' | 'app';
    contentId: string;
    contentTable?: string;
    contentKey?: string;
};

const sources: LegacySource[] = [
    {
        table: 'analytics_chart_views',
        id: 'analytics_chart_view_uuid',
        timestamp: 'timestamp',
        user: 'user_uuid',
        activityType: 'chart_view_or_execution',
        contentType: 'chart',
        contentId: 'chart_uuid',
        contentTable: 'saved_queries',
        contentKey: 'saved_query_uuid',
    },
    {
        table: 'analytics_dashboard_views',
        id: 'analytics_dashboard_view_uuid',
        timestamp: 'timestamp',
        user: 'user_uuid',
        activityType: 'dashboard_view',
        contentType: 'dashboard',
        contentId: 'dashboard_uuid',
        contentTable: 'dashboards',
        contentKey: 'dashboard_uuid',
    },
    {
        table: 'analytics_app_views',
        id: 'analytics_app_view_uuid',
        timestamp: 'timestamp',
        user: 'user_uuid',
        activityType: 'app_view',
        contentType: 'app',
        contentId: 'app_id',
        contentTable: 'apps',
        contentKey: 'app_id',
    },
    {
        table: 'apps',
        id: 'app_id',
        timestamp: 'created_at',
        user: 'created_by_user_uuid',
        activityType: 'app_created',
        contentType: 'app',
        contentId: 'app_id',
    },
    {
        table: 'apps',
        id: 'app_id',
        timestamp: 'deleted_at',
        user: 'deleted_by_user_uuid',
        activityType: 'app_deleted',
        contentType: 'app',
        contentId: 'app_id',
    },
    {
        table: 'app_versions',
        id: 'app_version_id',
        timestamp: 'created_at',
        user: 'created_by_user_uuid',
        activityType: 'app_version_created',
        contentType: 'app',
        contentId: 'app_id',
        contentTable: 'apps',
        contentKey: 'app_id',
    },
];

/** Retained database facts, kept separate from captured usage event totals. */
export class UsageLegacyHistoryModel {
    constructor(private readonly database: Knex) {}

    async *getJsonLines(
        organizationUuid: string,
        before: string,
    ): AsyncGenerator<string> {
        for (const source of sources) {
            let cursor: string | undefined;
            while (true) {
                const query = this.database(`${source.table} as h`);
                if (source.contentTable) {
                    query.join(
                        `${source.contentTable} as c`,
                        `c.${source.contentKey}`,
                        `h.${source.contentId}`,
                    );
                }
                const contentAlias = source.contentTable ? 'c' : 'h';
                // Dashboard project_uuid can be NULL on retained older rows;
                // its owning space remains the authoritative project link.
                if (source.contentType === 'dashboard') {
                    query
                        .join('spaces as s', 's.space_id', 'c.space_id')
                        .join('projects as p', 'p.project_id', 's.project_id');
                } else {
                    query.join(
                        'projects as p',
                        'p.project_uuid',
                        `${contentAlias}.project_uuid`,
                    );
                }
                query
                    .join(
                        'organizations as o',
                        'o.organization_id',
                        'p.organization_id',
                    )
                    .where('o.organization_uuid', organizationUuid)
                    .whereNot('p.project_type', ProjectType.PREVIEW)
                    .where(`h.${source.timestamp}`, '<', before)
                    .select(
                        `h.${source.id} as source_id`,
                        'p.project_uuid as project_id',
                        `h.${source.user} as user_id`,
                        `h.${source.contentId} as content_id`,
                    )
                    .select(
                        this.database.raw(
                            'to_char(??, \'YYYY-MM-DD"T"HH24:MI:SS.US"Z"\') as event_ts',
                            [`h.${source.timestamp}`],
                        ),
                    )
                    .orderBy(`h.${source.id}`)
                    .limit(1000);
                if (source.table === 'app_versions') {
                    query.select('h.version', 'h.status as current_status');
                }
                if (source.table === 'analytics_chart_views') {
                    // Never export arbitrary legacy context JSON or infer that
                    // an unclassified row was a standalone content fetch.
                    query.select(
                        this.database.raw(
                            "CASE WHEN h.context->>'source' = 'dashboard' THEN 'dashboard' END as context",
                        ),
                        this.database.raw(
                            "CASE WHEN h.context->>'source' = 'dashboard' AND h.context->>'dashboardUuid' ~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' THEN h.context->>'dashboardUuid' END as dashboard_id",
                        ),
                    );
                }
                if (cursor) query.where(`h.${source.id}`, '>', cursor);
                // Do not hold a connection while writing history to storage.
                // eslint-disable-next-line no-await-in-loop
                const rows = await this.database.transaction(async (trx) => {
                    await trx.raw('SET TRANSACTION READ ONLY');
                    await trx.raw("SET LOCAL statement_timeout = '10s'");
                    await trx.raw("SET LOCAL lock_timeout = '1s'");
                    return query.transacting(trx);
                });
                if (!rows.length) break;
                for (const row of rows) {
                    yield `${JSON.stringify({
                        ...Object.fromEntries(
                            historicalActivityColumns.map(({ name }) => [
                                name,
                                null,
                            ]),
                        ),
                        history_source: source.table,
                        record_id: `${source.activityType}:${row.source_id}`,
                        activity_type: source.activityType,
                        org_id: organizationUuid,
                        project_id: row.project_id,
                        user_id: row.user_id,
                        event_ts: row.event_ts,
                        schema_version: 1,
                        content_id: row.content_id,
                        content_type: source.contentType,
                        app_id:
                            source.contentType === 'app'
                                ? row.content_id
                                : null,
                        version: row.version ?? null,
                        current_status: row.current_status ?? null,
                        context: row.context ?? null,
                        dashboard_id: row.dashboard_id ?? null,
                    })}\n`;
                }
                cursor = rows[rows.length - 1].source_id;
            }
        }
    }
}
