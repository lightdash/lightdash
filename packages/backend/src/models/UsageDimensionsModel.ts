import { assertUnreachable } from '@lightdash/common';
import type { Knex } from 'knex';
import type { UsageDimensionName } from '../analytics/eventStream/usageDimensions';
import {
    usageContentInventoryQuery,
    usageContentTypes,
} from './usageContentInventory';

export const USAGE_DIMENSION_PAGE_SIZE = 1000;

type Organization = { organization_id: number; organization_uuid: string };
type SnapshotRow = { cursor: string; json: string };

export class UsageDimensionsModel {
    constructor(private readonly database: Knex) {}

    private async readPage<Row>(
        query: Knex.QueryBuilder,
        statementTimeoutMs = 5000,
    ): Promise<Row[]> {
        return this.database.transaction(async (trx) => {
            // Enforced by Postgres, including while Node is busy. Rollback releases
            // read locks on failure; no transaction is held across file/storage IO.
            await trx.raw('SET TRANSACTION READ ONLY');
            await trx.raw("SELECT set_config('statement_timeout', ?, true)", [
                `${statementTimeoutMs}ms`,
            ]);
            await trx.raw("SET LOCAL lock_timeout = '1s'");
            return query.transacting(trx);
        });
    }

    async *getOrganizations(): AsyncGenerator<Organization> {
        let cursor = 0;
        while (true) {
            // eslint-disable-next-line no-await-in-loop
            const rows = await this.readPage<Organization>(
                this.database('organizations')
                    .select('organization_id', 'organization_uuid')
                    .where('organization_id', '>', cursor)
                    .orderBy('organization_id')
                    .limit(USAGE_DIMENSION_PAGE_SIZE),
            );
            if (rows.length === 0) return;
            for (const row of rows) yield row;
            cursor = rows[rows.length - 1].organization_id;
        }
    }

    private async *readPages(
        query: Knex.QueryBuilder,
        cursorColumn: string,
    ): AsyncGenerator<string> {
        let cursor: string | null = null;
        while (true) {
            const page = query
                .clone()
                .select<SnapshotRow[]>(
                    this.database.raw('??::text AS cursor', [cursorColumn]),
                )
                .orderBy(cursorColumn)
                .limit(USAGE_DIMENSION_PAGE_SIZE);
            if (cursor !== null) page.where(cursorColumn, '>', cursor);
            // Each page releases its connection before waiting on file IO.
            // eslint-disable-next-line no-await-in-loop
            const rows = await this.readPage<SnapshotRow>(page);
            if (rows.length === 0) return;
            for (const row of rows) yield `${row.json}\n`;
            cursor = rows[rows.length - 1].cursor;
        }
    }

    async *getJsonLines(
        organization: Organization,
        dimension: UsageDimensionName,
        observedAt: Date = new Date(),
    ): AsyncGenerator<string> {
        const { organization_id: orgId, organization_uuid: orgUuid } =
            organization;
        switch (dimension) {
            case 'people': {
                let cursor = 0;
                while (true) {
                    const pageCursor = cursor;
                    const page = this.database
                        .with('people_page', (qb) =>
                            qb
                                .from('organization_memberships as m')
                                .join('users as u', 'u.user_id', 'm.user_id')
                                .where('m.organization_id', orgId)
                                .where('m.user_id', '>', pageCursor)
                                .where('u.is_internal', false)
                                .select(
                                    'u.user_id',
                                    'u.user_uuid',
                                    'u.first_name',
                                    'u.last_name',
                                    'u.is_active',
                                    'u.is_setup_complete',
                                    'm.role',
                                    'm.role_uuid',
                                    'm.created_at',
                                )
                                .orderBy('m.user_id')
                                .limit(USAGE_DIMENSION_PAGE_SIZE),
                        )
                        // Prevent PostgreSQL from re-evaluating this aggregate
                        // for each person when group membership has no user index.
                        .withMaterialized('people_groups', (qb) =>
                            qb
                                .from('group_memberships as gm')
                                .join(
                                    'people_page as p',
                                    'p.user_id',
                                    'gm.user_id',
                                )
                                .join(
                                    'groups as g',
                                    'g.group_uuid',
                                    'gm.group_uuid',
                                )
                                .where('gm.organization_id', orgId)
                                .where('g.organization_id', orgId)
                                .groupBy('gm.user_id')
                                .select(
                                    'gm.user_id',
                                    this.database.raw(`
                                json_agg(g.group_uuid ORDER BY g.group_uuid)::text AS group_ids,
                                json_agg(g.name ORDER BY g.group_uuid)::text AS group_names`),
                                ),
                        )
                        .from('people_page as p')
                        .leftJoin(
                            'people_groups as g',
                            'g.user_id',
                            'p.user_id',
                        )
                        .orderBy('p.user_id')
                        .select(
                            'p.user_id',
                            this.database.raw(
                                `json_build_object(
                            'org_id', ?::text, 'user_id', p.user_uuid,
                            'name', NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
                            'organization_role', p.role, 'role_id', p.role_uuid,
                            'membership_created_at', p.created_at, 'snapshot_at', ?::timestamptz,
                            'is_active', p.is_active, 'is_setup_complete', p.is_setup_complete,
                            'is_eligible', p.is_active AND p.is_setup_complete,
                            'group_ids', COALESCE(g.group_ids, '[]'),
                            'group_names', COALESCE(g.group_names, '[]')
                        )::text AS json`,
                                [orgUuid, observedAt.toISOString()],
                            ),
                        );
                    // Bounded pages and set-based group enrichment; no per-user
                    // subqueries and no transaction across storage IO.
                    // eslint-disable-next-line no-await-in-loop
                    const rows = await this.readPage<{
                        user_id: number;
                        json: string;
                    }>(page);
                    if (rows.length === 0) break;
                    for (const row of rows) yield `${row.json}\n`;
                    cursor = rows[rows.length - 1].user_id;
                }
                return;
            }
            case 'content': {
                for (const contentType of usageContentTypes) {
                    let cursor: string | null = null;
                    while (true) {
                        const page = usageContentInventoryQuery(
                            this.database,
                            orgId,
                            orgUuid,
                            contentType,
                            cursor,
                            USAGE_DIMENSION_PAGE_SIZE,
                        );
                        // eslint-disable-next-line no-await-in-loop
                        const rows: SnapshotRow[] = await this.readPage(
                            page,
                            10000,
                        );
                        if (rows.length === 0) break;
                        for (const row of rows) yield `${row.json}\n`;
                        cursor = rows[rows.length - 1].cursor;
                    }
                }
                return;
            }
            case 'agents': {
                const agents = this.database('ai_agent as a')
                    .where('a.organization_uuid', orgUuid)
                    .select(
                        this.database.raw(
                            `json_build_object(
                        'org_id', a.organization_uuid, 'agent_id', a.ai_agent_uuid,
                        'name', a.name
                    )::text AS json`,
                        ),
                    );
                yield* this.readPages(agents, 'a.ai_agent_uuid');
                return;
            }
            case 'charts': {
                const charts = this.database('saved_queries as c')
                    .join('projects as p', 'p.project_uuid', 'c.project_uuid')
                    .leftJoin(
                        'dashboards as d',
                        'd.dashboard_uuid',
                        'c.dashboard_uuid',
                    )
                    .leftJoin(
                        'spaces as s',
                        's.space_id',
                        this.database.raw('COALESCE(c.space_id, d.space_id)'),
                    )
                    .where('p.organization_id', orgId)
                    .select(
                        this.database.raw(
                            `json_build_object(
                        'org_id', ?::text, 'chart_id', c.saved_query_uuid,
                        'name', c.name, 'slug', c.slug,
                        'chart_kind', c.last_version_chart_kind,
                        'space_name', s.name,
                        'is_deleted', c.deleted_at IS NOT NULL OR d.deleted_at IS NOT NULL OR s.deleted_at IS NOT NULL
                    )::text AS json`,
                            [orgUuid],
                        ),
                    );
                yield* this.readPages(charts, 'c.saved_query_id');
                const sqlCharts = this.database('saved_sql as c')
                    .join('projects as p', 'p.project_uuid', 'c.project_uuid')
                    .leftJoin(
                        'dashboards as d',
                        'd.dashboard_uuid',
                        'c.dashboard_uuid',
                    )
                    .leftJoin(
                        'spaces as own_space',
                        'own_space.space_uuid',
                        'c.space_uuid',
                    )
                    .leftJoin(
                        'spaces as s',
                        's.space_id',
                        this.database.raw(
                            'COALESCE(own_space.space_id, d.space_id)',
                        ),
                    )
                    .where('p.organization_id', orgId)
                    .select(
                        this.database.raw(
                            `json_build_object(
                        'org_id', ?::text, 'chart_id', c.saved_sql_uuid,
                        'name', c.name, 'slug', c.slug,
                        'chart_kind', c.last_version_chart_kind,
                        'space_name', s.name,
                        'is_deleted', c.deleted_at IS NOT NULL OR d.deleted_at IS NOT NULL OR s.deleted_at IS NOT NULL
                    )::text AS json`,
                            [orgUuid],
                        ),
                    );
                yield* this.readPages(sqlCharts, 'c.saved_sql_uuid');
                return;
            }
            case 'dashboards': {
                const dashboards = this.database('dashboards as d')
                    .join('spaces as s', 's.space_id', 'd.space_id')
                    .join('projects as p', 'p.project_id', 's.project_id')
                    .where('p.organization_id', orgId)
                    .select(
                        this.database.raw(
                            `json_build_object(
                        'org_id', ?::text, 'dashboard_id', d.dashboard_uuid,
                        'name', d.name, 'slug', d.slug, 'space_name', s.name,
                        'is_deleted', d.deleted_at IS NOT NULL OR s.deleted_at IS NOT NULL
                    )::text AS json`,
                            [orgUuid],
                        ),
                    );
                yield* this.readPages(dashboards, 'd.dashboard_id');
                return;
            }
            case 'users': {
                const users = this.database('organization_memberships as m')
                    .join('users as u', 'u.user_id', 'm.user_id')
                    .where('m.organization_id', orgId)
                    .where('u.is_active', true)
                    .where('u.is_internal', false)
                    .select(
                        this.database.raw(
                            `json_build_object(
                        'org_id', ?::text, 'user_id', u.user_uuid,
                        'name', NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), '')
                    )::text AS json`,
                            [orgUuid],
                        ),
                    );
                yield* this.readPages(users, 'm.user_id');
                return;
            }
            default:
                assertUnreachable(dimension, 'Unknown usage dimension');
        }
    }
}
