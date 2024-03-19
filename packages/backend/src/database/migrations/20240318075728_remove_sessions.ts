import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // We delete all sessions with a migration because
    // now we store the organization in the session
    // and we don't want to keep old sessions and make it backwards compatible.
    return knex.table('sessions').delete();
}

export async function down(knex: Knex): Promise<void> {
    // If we rollback, we also want to remove the new sessions with organization
    return knex.table('sessions').delete();
}
