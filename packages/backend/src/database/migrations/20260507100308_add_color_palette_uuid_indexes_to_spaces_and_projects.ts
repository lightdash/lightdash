import { Knex } from 'knex';

const SpacesTable = 'spaces';
const ProjectsTable = 'projects';
const SpacesIndex = 'spaces_color_palette_uuid_index';
const ProjectsIndex = 'projects_color_palette_uuid_index';

export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await knex.raw(
            `CREATE INDEX CONCURRENTLY IF NOT EXISTS ?? ON ?? (color_palette_uuid)`,
            [SpacesIndex, SpacesTable],
        );
        await knex.raw(
            `CREATE INDEX CONCURRENTLY IF NOT EXISTS ?? ON ?? (color_palette_uuid)`,
            [ProjectsIndex, ProjectsTable],
        );
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ??`, [SpacesIndex]);
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ??`, [ProjectsIndex]);
}
