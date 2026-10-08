import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds department_uuid to the department_links primary key; every existing row fits the wider key and code that links a group to one department keeps working',
} as const;

const LOCK_TIMEOUT = '5s';
const LINKS = 'department_links';

const logWarning = (message: string): void => {
    // eslint-disable-next-line no-console
    console.warn(`  ${LINKS}: WARNING: ${message}`);
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    // Still leads with the group, so finding a group's departments keeps using it
    await knex.schema.alterTable(LINKS, (table) => {
        table.dropPrimary();
        table.primary(['link_type', 'link_uuid', 'department_uuid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    // A group linked to several departments keeps the link with the lowest department uuid
    const duplicates = await knex.raw<{ rows: { count: string }[] }>(`
        SELECT count(*) AS count
        FROM ${LINKS} extra
        WHERE EXISTS (
            SELECT 1 FROM ${LINKS} kept
            WHERE kept.link_type = extra.link_type
              AND kept.link_uuid = extra.link_uuid
              AND kept.department_uuid < extra.department_uuid
        )
    `);
    const count = Number(duplicates.rows[0]?.count ?? 0);
    if (count > 0) {
        logWarning(
            `dropping ${count} duplicate group links; each group keeps only its link with the lowest department uuid`,
        );
    }
    await knex.raw(`
        DELETE FROM ${LINKS} extra
        USING ${LINKS} kept
        WHERE extra.link_type = kept.link_type
          AND extra.link_uuid = kept.link_uuid
          AND extra.department_uuid > kept.department_uuid
    `);
    await knex.schema.alterTable(LINKS, (table) => {
        table.dropPrimary();
        table.primary(['link_type', 'link_uuid']);
    });
}
