import { assertUnreachable, generateSlug } from '@lightdash/common';
import { Knex } from 'knex';
import { DashboardsTableName } from '../database/entities/dashboards';
import { ProjectTableName } from '../database/entities/projects';
import { SavedChartsTableName } from '../database/entities/savedCharts';
import { SpaceTableName } from '../database/entities/spaces';

export const generateUniqueSlug = async (
    trx: Knex,
    tableName:
        | 'saved_semantic_viewer_charts'
        | 'saved_queries'
        | 'saved_sql'
        | 'dashboards'
        | 'spaces',
    name: string,
) => {
    const baseSlug = generateSlug(name);
    const matchingSlugs: string[] = await trx(tableName)
        .select('slug')
        .where('slug', 'like', `${baseSlug}%`)
        .pluck('slug');
    let slug = generateSlug(name);
    let inc = 0;
    while (matchingSlugs.includes(slug)) {
        inc += 1;
        slug = `${baseSlug}-${inc}`; // generate new slug with number suffix
    }
    return slug;
};

export const generateUniqueSlugScopedToProject = async (
    trx: Knex,
    projectUuid: string,
    tableName:
        | 'saved_semantic_viewer_charts'
        | 'saved_queries'
        | 'saved_sql'
        | 'dashboards'
        | 'spaces',
    name: string,
) => {
    let matchingSlugsQuery: Knex.QueryBuilder;
    switch (tableName) {
        case 'saved_queries':
            matchingSlugsQuery = trx(SavedChartsTableName)
                .leftJoin(
                    DashboardsTableName,
                    `${DashboardsTableName}.dashboard_uuid`,
                    `${SavedChartsTableName}.dashboard_uuid`,
                )
                .innerJoin(SpaceTableName, function spaceJoin() {
                    this.on(
                        `${SpaceTableName}.space_id`,
                        '=',
                        `${DashboardsTableName}.space_id`,
                    ).orOn(
                        `${SpaceTableName}.space_id`,
                        '=',
                        `${SavedChartsTableName}.space_id`,
                    );
                })
                .innerJoin(
                    ProjectTableName,
                    `${SpaceTableName}.project_id`,
                    `${ProjectTableName}.project_id`,
                )
                .where('project_uuid', projectUuid);
            break;
        case 'saved_sql':
        case 'dashboards':
        case 'spaces':
        case 'saved_semantic_viewer_charts':
            throw new Error('Not implemented');
        default:
            return assertUnreachable(
                tableName,
                'generateUniqueSlugScopedToProject',
            );
    }
    const baseSlug = generateSlug(name);
    const matchingSlugs: string[] = await matchingSlugsQuery
        .select(`${SavedChartsTableName}.slug`)
        .where(`${SavedChartsTableName}.slug`, 'like', `${baseSlug}%`)
        .pluck(`${SavedChartsTableName}.slug`);

    let slug = generateSlug(name);
    let inc = 0;
    while (matchingSlugs.includes(slug)) {
        inc += 1;
        slug = `${baseSlug}-${inc}`; // generate new slug with number suffix
    }
    return slug;
};
