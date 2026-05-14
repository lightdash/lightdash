import {
    getDefaultResolvedColorPalette,
    type ResolvedProjectColorPalette,
} from '@lightdash/common';
import { Knex } from 'knex';
import { type LightdashConfig } from '../../config/parseConfig';
import { DashboardsTableName } from './dashboards';
import { OrganizationTableName } from './organizations';
import { ProjectTableName } from './projects';
import { SavedChartsTableName } from './savedCharts';
import { SpaceTableName } from './spaces';

export const OrganizationColorPaletteTableName = 'organization_color_palettes';

export type DbOrganizationColorPalette = {
    color_palette_uuid: string;
    organization_uuid: string;
    name: string;
    colors: string[];
    dark_colors: string[] | null;
    created_at: Date;
};

export type DbOrganizationColorPaletteIn = Pick<
    DbOrganizationColorPalette,
    'name' | 'colors' | 'organization_uuid' | 'dark_colors'
>;

export type DbOrganizationColorPaletteUpdate = Partial<
    Pick<DbOrganizationColorPalette, 'name' | 'colors' | 'dark_colors'>
>;

export type OrganizationColorPaletteTable = Knex.CompositeTableType<
    DbOrganizationColorPalette,
    DbOrganizationColorPaletteIn,
    DbOrganizationColorPaletteUpdate
>;

type ResolverRow = {
    project_uuid: string;
    project_name: string;
    organization_uuid: string;
    organization_name: string;
    chart_uuid: string | null;
    chart_name: string | null;
    chart_palette_uuid: string | null;
    chart_palette_name: string | null;
    chart_palette_colors: string[] | null;
    chart_palette_dark_colors: string[] | null;
    space_uuid: string | null;
    space_name: string | null;
    space_palette_uuid: string | null;
    space_palette_name: string | null;
    space_palette_colors: string[] | null;
    space_palette_dark_colors: string[] | null;
    dashboard_uuid: string | null;
    dashboard_name: string | null;
    dashboard_palette_uuid: string | null;
    dashboard_palette_name: string | null;
    dashboard_palette_colors: string[] | null;
    dashboard_palette_dark_colors: string[] | null;
    project_palette_uuid: string | null;
    project_palette_name: string | null;
    project_palette_colors: string[] | null;
    project_palette_dark_colors: string[] | null;
    org_palette_uuid: string | null;
    org_palette_name: string | null;
    org_palette_colors: string[] | null;
    org_palette_dark_colors: string[] | null;
};

/**
 * Resolves the color palette for a chart by walking up the
 * chart → dashboard → space → parent space → … → project → organization hierarchy.
 *
 * The lightdashConfig.appearance.overrideColorPalette wins over everything,
 * matching OrganizationModel.get() behaviour.
 *
 * `dashboardUuid` is render context ("currently shown inside"), NOT derived
 * from `saved_queries.dashboard_uuid` (the "owned by" FK) — callers must
 * pass it explicitly when known. The seed space for the recursive walk is
 * derived internally from chart.space_id, falling back to the owning
 * dashboard's space_id when the chart is dashboard-owned. `spaceUuid` is
 * accepted for explicit space-only previews (e.g. settings UI showing
 * what palette would resolve for a nested space).
 *
 * SQL charts (`saved_sql`) inherit from the cascade but have no per-chart
 * override — call this without `chartUuid` so the resolver skips the
 * chart-level branch and seeds from `dashboardUuid` / `spaceUuid` only.
 */
export async function resolveColorPalette(args: {
    database: Knex;
    lightdashConfig: LightdashConfig;
    projectUuid: string;
    chartUuid?: string;
    dashboardUuid?: string;
    spaceUuid?: string;
}): Promise<ResolvedProjectColorPalette> {
    const override = args.lightdashConfig.appearance.overrideColorPalette;
    if (override && override.length > 0) {
        return {
            paletteUuid: null,
            paletteName: null,
            colors: override,
            darkColors: null,
            source: { type: 'config' },
        };
    }

    // chart_origin: chart-level palette + seed space (chart's space, falling
    //   back to the owning-dashboard's space for dashboard-owned charts).
    // dashboard_origin: seed space derived from the explicit container
    //   dashboard.
    // Seed precedence (caller intent first): explicit spaceUuid →
    //   explicit dashboardUuid → chart-derived. Both spaceUuid and
    //   dashboardUuid are caller-passed render context, so they outrank
    //   the chart-derived seed which is implicit.
    // space_chain: recursive walk up parent_space_uuid; chosen_space picks
    //   the closest override.
    const result: ResolverRow | undefined = await args.database
        .raw<{ rows: ResolverRow[] }>(
            `
            WITH RECURSIVE chart_origin AS (
                SELECT
                    sq.saved_query_uuid AS chart_uuid,
                    sq.name AS chart_name,
                    sq.color_palette_uuid AS chart_palette_uuid,
                    COALESCE(s.space_uuid, ds.space_uuid) AS seed_space_uuid
                FROM ${SavedChartsTableName} sq
                LEFT JOIN ${SpaceTableName} s
                    ON s.space_id = sq.space_id AND s.deleted_at IS NULL
                LEFT JOIN ${DashboardsTableName} owning_d
                    ON owning_d.dashboard_uuid = sq.dashboard_uuid AND owning_d.deleted_at IS NULL
                LEFT JOIN ${SpaceTableName} ds
                    ON ds.space_id = owning_d.space_id AND ds.deleted_at IS NULL
                WHERE sq.saved_query_uuid = :chartUuid AND sq.deleted_at IS NULL
            ),
            dashboard_origin AS (
                SELECT s.space_uuid AS seed_space_uuid
                FROM ${DashboardsTableName} d
                LEFT JOIN ${SpaceTableName} s
                    ON s.space_id = d.space_id AND s.deleted_at IS NULL
                WHERE d.dashboard_uuid = :dashboardUuid AND d.deleted_at IS NULL
            ),
            seed AS (
                SELECT COALESCE(
                    :spaceUuid::uuid,
                    (SELECT seed_space_uuid FROM dashboard_origin),
                    (SELECT seed_space_uuid FROM chart_origin)
                ) AS space_uuid
            ),
            space_chain AS (
                SELECT space_uuid, name, parent_space_uuid, color_palette_uuid, 0 AS depth
                FROM ${SpaceTableName}
                WHERE space_uuid = (SELECT space_uuid FROM seed) AND deleted_at IS NULL

                UNION ALL

                SELECT s.space_uuid, s.name, s.parent_space_uuid, s.color_palette_uuid, sc.depth + 1
                FROM ${SpaceTableName} s
                JOIN space_chain sc ON s.space_uuid = sc.parent_space_uuid
                WHERE s.deleted_at IS NULL
            ),
            chosen_space AS (
                SELECT space_uuid, name, color_palette_uuid
                FROM space_chain
                WHERE color_palette_uuid IS NOT NULL
                ORDER BY depth ASC
                LIMIT 1
            )
            SELECT
                p.project_uuid AS project_uuid,
                p.name AS project_name,
                o.organization_uuid AS organization_uuid,
                o.organization_name AS organization_name,
                co.chart_uuid AS chart_uuid,
                co.chart_name AS chart_name,
                cp.color_palette_uuid AS chart_palette_uuid,
                cp.name AS chart_palette_name,
                cp.colors AS chart_palette_colors,
                cp.dark_colors AS chart_palette_dark_colors,
                cs.space_uuid AS space_uuid,
                cs.name AS space_name,
                sp.color_palette_uuid AS space_palette_uuid,
                sp.name AS space_palette_name,
                sp.colors AS space_palette_colors,
                sp.dark_colors AS space_palette_dark_colors,
                d.dashboard_uuid AS dashboard_uuid,
                d.name AS dashboard_name,
                dp.color_palette_uuid AS dashboard_palette_uuid,
                dp.name AS dashboard_palette_name,
                dp.colors AS dashboard_palette_colors,
                dp.dark_colors AS dashboard_palette_dark_colors,
                pp.color_palette_uuid AS project_palette_uuid,
                pp.name AS project_palette_name,
                pp.colors AS project_palette_colors,
                pp.dark_colors AS project_palette_dark_colors,
                op.color_palette_uuid AS org_palette_uuid,
                op.name AS org_palette_name,
                op.colors AS org_palette_colors,
                op.dark_colors AS org_palette_dark_colors
            FROM ${ProjectTableName} p
            INNER JOIN ${OrganizationTableName} o
                ON o.organization_id = p.organization_id
            LEFT JOIN chart_origin co ON true
            LEFT JOIN ${OrganizationColorPaletteTableName} cp
                ON cp.color_palette_uuid = co.chart_palette_uuid
            LEFT JOIN chosen_space cs ON true
            LEFT JOIN ${OrganizationColorPaletteTableName} sp
                ON sp.color_palette_uuid = cs.color_palette_uuid
            LEFT JOIN ${DashboardsTableName} d
                ON d.dashboard_uuid = :dashboardUuid AND d.deleted_at IS NULL
            LEFT JOIN ${OrganizationColorPaletteTableName} dp
                ON dp.color_palette_uuid = d.color_palette_uuid
            LEFT JOIN ${OrganizationColorPaletteTableName} pp
                ON pp.color_palette_uuid = p.color_palette_uuid
            LEFT JOIN ${OrganizationColorPaletteTableName} op
                ON op.color_palette_uuid = o.color_palette_uuid
            WHERE p.project_uuid = :projectUuid
            `,
            {
                chartUuid: args.chartUuid ?? null,
                dashboardUuid: args.dashboardUuid ?? null,
                spaceUuid: args.spaceUuid ?? null,
                projectUuid: args.projectUuid,
            },
        )
        .then((res) => res.rows[0]);

    if (!result) {
        return getDefaultResolvedColorPalette();
    }

    if (
        result.chart_palette_uuid &&
        result.chart_palette_colors &&
        result.chart_palette_name &&
        result.chart_uuid &&
        result.chart_name
    ) {
        return {
            paletteUuid: result.chart_palette_uuid,
            paletteName: result.chart_palette_name,
            colors: result.chart_palette_colors,
            darkColors: result.chart_palette_dark_colors,
            source: {
                type: 'chart',
                uuid: result.chart_uuid,
                name: result.chart_name,
            },
        };
    }

    if (
        result.dashboard_palette_uuid &&
        result.dashboard_palette_colors &&
        result.dashboard_palette_name &&
        result.dashboard_uuid &&
        result.dashboard_name
    ) {
        return {
            paletteUuid: result.dashboard_palette_uuid,
            paletteName: result.dashboard_palette_name,
            colors: result.dashboard_palette_colors,
            darkColors: result.dashboard_palette_dark_colors,
            source: {
                type: 'dashboard',
                uuid: result.dashboard_uuid,
                name: result.dashboard_name,
            },
        };
    }

    if (
        result.space_palette_uuid &&
        result.space_palette_colors &&
        result.space_palette_name &&
        result.space_uuid &&
        result.space_name
    ) {
        return {
            paletteUuid: result.space_palette_uuid,
            paletteName: result.space_palette_name,
            colors: result.space_palette_colors,
            darkColors: result.space_palette_dark_colors,
            source: {
                type: 'space',
                uuid: result.space_uuid,
                name: result.space_name,
            },
        };
    }

    if (
        result.project_palette_uuid &&
        result.project_palette_colors &&
        result.project_palette_name
    ) {
        return {
            paletteUuid: result.project_palette_uuid,
            paletteName: result.project_palette_name,
            colors: result.project_palette_colors,
            darkColors: result.project_palette_dark_colors,
            source: {
                type: 'project',
                uuid: result.project_uuid,
                name: result.project_name,
            },
        };
    }

    if (
        result.org_palette_uuid &&
        result.org_palette_colors &&
        result.org_palette_name
    ) {
        return {
            paletteUuid: result.org_palette_uuid,
            paletteName: result.org_palette_name,
            colors: result.org_palette_colors,
            darkColors: result.org_palette_dark_colors,
            source: {
                type: 'organization',
                uuid: result.organization_uuid,
                name: result.organization_name,
            },
        };
    }

    return getDefaultResolvedColorPalette();
}
