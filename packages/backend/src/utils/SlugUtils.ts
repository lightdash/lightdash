import { assertUnreachable, generateSlug } from '@lightdash/common';
import { Knex } from 'knex';
import { customAlphabet as createCustomNanoid } from 'nanoid';
import { DashboardsTableName } from '../database/entities/dashboards';
import { ProjectTableName } from '../database/entities/projects';
import { SavedChartsTableName } from '../database/entities/savedCharts';
import { SpaceTableName } from '../database/entities/spaces';

export const generateUniqueSlug = async (
    trx: Knex,
    tableName: 'saved_queries' | 'saved_sql' | 'dashboards' | 'spaces',
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

const customNanoid = createCustomNanoid(
    '1234567890abcdefghijklmnopqrstuvwxyz',
    10,
);

export const generateUniqueSpaceSlug = async (
    name: string,
    projectId: number,
    { trx }: { trx: Knex },
) => {
    const baseSlug = generateSlug(name);
    const checkSlugExists = (slug: string) =>
        trx(SpaceTableName)
            .select('slug')
            .where('slug', '=', slug)
            .where('project_id', projectId)
            .first();

    if (await checkSlugExists(baseSlug)) {
        return `${baseSlug}-${customNanoid()}`;
    }

    return baseSlug;
};

export const generateUniqueSlugScopedToProject = async (
    trx: Knex,
    projectUuid: string,
    tableName: 'saved_queries' | 'saved_sql' | 'dashboards' | 'spaces',
    name: string,
) => {
    const baseSlug = generateSlug(name);
    let matchingSlugs: string[];
    switch (tableName) {
        case 'saved_queries':
            matchingSlugs = await trx(SavedChartsTableName)
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
                .where('project_uuid', projectUuid)
                .select(`${SavedChartsTableName}.slug`)
                .where(`${SavedChartsTableName}.slug`, 'like', `${baseSlug}%`)
                .pluck(`${SavedChartsTableName}.slug`);
            break;
        case 'dashboards':
            matchingSlugs = await trx(DashboardsTableName)
                .innerJoin(
                    SpaceTableName,
                    `${SpaceTableName}.space_id`,
                    `${DashboardsTableName}.space_id`,
                )
                .innerJoin(
                    ProjectTableName,
                    `${SpaceTableName}.project_id`,
                    `${ProjectTableName}.project_id`,
                )
                .where('project_uuid', projectUuid)
                .select(`${DashboardsTableName}.slug`)
                .where(`${DashboardsTableName}.slug`, 'like', `${baseSlug}%`)
                .pluck(`${DashboardsTableName}.slug`);
            break;
        case 'saved_sql':
        case 'spaces':
            throw new Error('Not implemented');
        default:
            return assertUnreachable(
                tableName,
                'generateUniqueSlugScopedToProject',
            );
    }

    let slug = generateSlug(name);
    let inc = 0;
    while (matchingSlugs.includes(slug)) {
        inc += 1;
        slug = `${baseSlug}-${inc}`; // generate new slug with number suffix
    }
    return slug;
};
