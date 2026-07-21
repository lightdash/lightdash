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
const SPACE_ACCESS_LOCK_NAMESPACE = 3;

const MAX_GENERATED_SAVED_CHART_SLUG_LENGTH = 255;

const getSavedChartSlugCandidate = (
    baseSlug: string,
    increment: number,
): string => {
    if (increment === 0) return baseSlug;

    const suffix = `-${increment}`;
    return `${baseSlug.slice(
        0,
        MAX_GENERATED_SAVED_CHART_SLUG_LENGTH - suffix.length,
    )}${suffix}`;
};

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

export const acquireSpaceAccessLock = async (
    trx: Knex,
    spaceUuid: string,
): Promise<void> => {
    await trx.raw('SELECT pg_advisory_xact_lock(?, hashtext(?))', [
        SPACE_ACCESS_LOCK_NAMESPACE,
        spaceUuid,
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
        case SavedChartsTableName: {
            let increment = 0;
            for (;;) {
                const candidate = getSavedChartSlugCandidate(
                    baseSlug,
                    increment,
                );
                // eslint-disable-next-line no-await-in-loop
                const existing = await trx(SavedChartsTableName)
                    .select(`${SavedChartsTableName}.saved_query_id`)
                    .where(`${SavedChartsTableName}.project_uuid`, projectUuid)
                    .where(`${SavedChartsTableName}.slug`, candidate)
                    .first();
                if (!existing) return candidate;
                increment += 1;
            }
        }
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
                .where(`${ProjectTableName}.project_uuid`, projectUuid)
                .select(`${DashboardsTableName}.slug`)
                .where(`${DashboardsTableName}.slug`, 'like', `${baseSlug}%`)
                .pluck(`${DashboardsTableName}.slug`);
            break;
        case SavedSqlTableName:
            matchingSlugs = await trx(SavedSqlTableName)
                .where(`${SavedSqlTableName}.project_uuid`, projectUuid)
                .select(`${SavedSqlTableName}.slug`)
                .where(`${SavedSqlTableName}.slug`, 'like', `${baseSlug}%`)
                .pluck(`${SavedSqlTableName}.slug`);
            break;
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
