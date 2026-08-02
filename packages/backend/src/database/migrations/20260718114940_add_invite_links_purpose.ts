import { InviteLinkPurpose } from '@lightdash/common';
import { Knex } from 'knex';

const InviteLinksTableName = 'invite_links';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(InviteLinksTableName, (table) => {
        table.text('purpose').notNullable().defaultTo(InviteLinkPurpose.Member);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(InviteLinksTableName, (table) => {
        table.dropColumn('purpose');
    });
}
