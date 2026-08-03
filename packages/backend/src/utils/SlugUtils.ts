import { assertUnreachable, generateSlug } from '@lightdash/common';
import { Knex } from 'knex';
import { AppsTableName } from '../database/entities/apps';
import { DashboardsTableName } from '../database/entities/dashboards';
import { SavedChartsTableName } from '../database/entities/savedCharts';
import { SavedSqlTableName } from '../database/entities/savedSql';
import { SpaceTableName } from '../database/entities/spaces';

type ProjectUuidSlugTable =
    | typeof AppsTableName
    | typeof SavedChartsTableName
    | typeof SavedSqlTableName
    | typeof DashboardsTableName;

type SlugTable = ProjectUuidSlugTable | typeof SpaceTableName;

const PROJECT_SLUG_LOCK_NAMESPACE = 2;
const SPACE_ACCESS_LOCK_NAMESPACE = 3;

const MAX_GENERATED_SAVED_CHART_SLUG_LENGTH = 255;
const MAX_GENERATED_APP_SLUG_LENGTH = 255;

const getSlugCandidate = (
    tableName: SlugTable,
    baseSlug: string,
    increment: number,
): string => {
    const suffix = increment === 0 ? '' : `-${increment}`;
    switch (tableName) {
        case SavedChartsTableName:
            if (increment === 0) return baseSlug;
            return `${baseSlug.slice(
                0,
                MAX_GENERATED_SAVED_CHART_SLUG_LENGTH - suffix.length,
            )}${suffix}`;
        case AppsTableName:
            return `${baseSlug.slice(
                0,
                MAX_GENERATED_APP_SLUG_LENGTH - suffix.length,
            )}${suffix}`;
        case DashboardsTableName:
        case SavedSqlTableName:
        case SpaceTableName:
            return `${baseSlug}${suffix}`;
        default:
            return assertUnreachable(tableName, 'getSlugCandidate');
    }
};

/**
 * Serialize the small find-then-insert window for a project slug. Database
 * constraints remain the final authority for project-scoped uniqueness.
 */
export const acquireProjectSlugLock = async (
    trx: Knex,
    projectUuid: string,
    slug: string,
): Promise<void> => {
    await trx.raw('SELECT pg_advisory_xact_lock(?, hashtext(?))', [
        PROJECT_SLUG_LOCK_NAMESPACE,
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

export function generateUniqueSlugScopedToProject(
    trx: Knex,
    projectUuid: string,
    tableName: ProjectUuidSlugTable,
    name: string,
): Promise<string>;
export function generateUniqueSlugScopedToProject(
    trx: Knex,
    projectId: number,
    tableName: typeof SpaceTableName,
    name: string,
): Promise<string>;
export async function generateUniqueSlugScopedToProject(
    trx: Knex,
    projectOwner: string | number,
    tableName: SlugTable,
    name: string,
): Promise<string> {
    const baseSlug = generateSlug(name);
    let increment = 0;
    for (;;) {
        const candidate = getSlugCandidate(tableName, baseSlug, increment);
        const ownerColumn =
            tableName === SpaceTableName
                ? `${SpaceTableName}.project_id`
                : `${tableName}.project_uuid`;
        // Slug reservations include soft-deleted rows so restoring content
        // cannot create an ambiguous project-scoped identity.
        // eslint-disable-next-line no-await-in-loop
        const existing = await trx(tableName)
            .select(`${tableName}.slug`)
            .where(ownerColumn, projectOwner)
            .where(`${tableName}.slug`, candidate)
            .first();
        if (!existing) return candidate;
        increment += 1;
    }
}
