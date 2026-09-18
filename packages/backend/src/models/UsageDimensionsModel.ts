import { assertUnreachable } from '@lightdash/common';
import type { Knex } from 'knex';
import type { UsageDimensionName } from '../analytics/eventStream/usageDimensions';

export const USAGE_DIMENSION_PAGE_SIZE = 1000;

type Organization = { organization_id: number; organization_uuid: string };
type SnapshotRow = { cursor: string; json: string };

export class UsageDimensionsModel {
    constructor(private readonly database: Knex) {}

    async *getOrganizations(): AsyncGenerator<Organization> {
        let cursor = 0;
        while (true) {
            // eslint-disable-next-line no-await-in-loop
            const rows = await this.database('organizations')
                .select('organization_id', 'organization_uuid')
                .where('organization_id', '>', cursor)
                .orderBy('organization_id')
                .limit(USAGE_DIMENSION_PAGE_SIZE);
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
            const rows = await page;
            if (rows.length === 0) return;
            for (const row of rows) yield `${row.json}\n`;
            cursor = rows[rows.length - 1].cursor;
        }
    }

    async *getJsonLines(
        organization: Organization,
        dimension: UsageDimensionName,
    ): AsyncGenerator<string> {
        const { organization_id: orgId, organization_uuid: orgUuid } =
            organization;
        switch (dimension) {
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
