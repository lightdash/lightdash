import { SEED_GROUP } from '@lightdash/common';
import { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
    await knex('groups').del();
    await knex('groups').insert({
        ...SEED_GROUP,
        organization_id: 1,
    });
}
