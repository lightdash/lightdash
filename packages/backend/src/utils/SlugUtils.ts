import { assertUnreachable, generateSlug } from '@lightdash/common';
import { Knex } from 'knex';
import { customAlphabet as createCustomNanoid } from 'nanoid';
import { DashboardsTableName } from '../database/entities/dashboards';
import { ProjectTableName } from '../database/entities/projects';
import { SavedChartsTableName } from '../database/entities/savedCharts';
import { SavedSqlTableName } from '../database/entities/savedSql';
import { SpaceTableName } from '../database/entities/spaces';

type SlugTables =
    | typeof SavedChartsTableName
    | typeof SavedSqlTableName
    | typeof DashboardsTableName
    | typeof SpaceTableName;

// Advisory-lock namespace for content-as-code / promotion slug creation.
// Namespace 1 is already used by cached explores (ProjectModel), so use 2 here
// to avoid clashing with that lock space.
const CONTENT_AS_CODE_SLUG_LOCK_NAMESPACE = 2;

/**
 * Take a transaction-scoped Postgres advisory lock keyed on (projectUuid, slug).
 *
 * Content-as-code (and promotion) force the exact slug from the YAML/source when
 * creating charts and dashboards, bypassing the unique-slug generation. The
 * create-vs-update decision in CoderService is a non-atomic find-then-create, so
 * two concurrent uploads of the same slug could both decide to create and insert
 * duplicate slugs (PROD-7883) — there is no DB unique constraint to catch it.
 *
 * Holding this lock around the find-then-create makes that decision atomic: a
 * second caller with the same key blocks until the first transaction commits, by
 * which point the first row is visible and the second can dedupe instead of
 * inserting a duplicate. The lock is released automatically when `trx` ends.
 */
export const acquireProjectSlugLock = async (
    trx: Knex,
    projectUuid: string,
    slug: string,
): Promise<void> => {
    await trx.raw('SELECT pg_advisory_xact_lock(?, hashtext(?))', [
        CONTENT_AS_CODE_SLUG_LOCK_NAMESPACE,
        `${projectUuid}:${slug}`,
    ]);
};

export const generateUniqueSlug = async (
    trx: Knex,
    tableName: SlugTables,
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
    tableName: SlugTables,
    name: string,
) => {
    const baseSlug = generateSlug(name);
    let matchingSlugs: string[];
    switch (tableName) {
        case SavedChartsTableName:
            // NOTE: no `deleted_at IS NULL` filter here because
            // we need to check for soft deleted charts as well
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
        case DashboardsTableName:
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
        case SavedSqlTableName:
        case SpaceTableName:
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
