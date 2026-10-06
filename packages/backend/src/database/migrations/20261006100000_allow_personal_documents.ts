import { type Knex } from 'knex';

const DocumentsTableName = 'documents';

export const classification = {
    kind: 'safe',
    reason: 'Drops NOT NULL on documents.space_id without rewriting rows; the previous release inner-joins spaces, so personal Documents stay invisible to it',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(DocumentsTableName, (table) => {
        table.setNullable('space_id');
    });
}

export async function down(knex: Knex): Promise<void> {
    const personal = await knex(DocumentsTableName)
        .whereNull('space_id')
        .first('document_id');
    if (personal) {
        throw new Error(
            'irreversible: personal Documents have no Space; move or delete them before rolling back',
        );
    }
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(DocumentsTableName, (table) => {
        table.dropNullable('space_id');
    });
}
