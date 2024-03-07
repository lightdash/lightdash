import { SEED_GROUP, SEED_ORG_1 } from '@lightdash/common';
import { type Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
    const [org] = await knex('organizations')
        .select('organization_id')
        .where('organization_uuid', SEED_ORG_1.organization_uuid);
    await knex('groups').del();
    await knex('groups').insert({
        group_uuid: SEED_GROUP.groupUuid,
        name: SEED_GROUP.name,
        organization_id: org.organization_id,
    });
}
