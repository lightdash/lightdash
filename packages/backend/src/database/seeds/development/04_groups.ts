import {
    SEED_GROUP,
    SEED_GROUP_2,
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_ORG_1_EDITOR,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    GroupUserAttributesTable,
    UserAttributesTable,
} from '../../entities/userAttributes';

export async function seed(knex: Knex): Promise<void> {
    const [org] = await knex('organizations')
        .select('organization_id')
        .where('organization_uuid', SEED_ORG_1.organization_uuid);
    await knex('groups').del();
    await knex('groups').insert({
        group_uuid: SEED_GROUP.groupUuid,
        name: SEED_GROUP.name,
        organization_id: org.organization_id,
        created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
        updated_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
    });
    await knex('groups').insert({
        group_uuid: SEED_GROUP_2.groupUuid,
        name: SEED_GROUP_2.name,
        organization_id: org.organization_id,
        created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
        updated_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
    });

    const [editor] = await knex('users')
        .select('user_id')
        .where('user_uuid', SEED_ORG_1_EDITOR.user_uuid);

    await knex('group_memberships').insert({
        group_uuid: SEED_GROUP_2.groupUuid,
        user_id: editor.user_id,
        organization_id: org.organization_id,
    });
    const attribute = await knex(UserAttributesTable)
        .where({ organization_id: org.organization_id, name: 'is_admin' })
        .first('user_attribute_uuid');
    if (!attribute) throw new Error('Missing is_admin seed attribute');
    await knex(GroupUserAttributesTable).insert({
        user_attribute_uuid: attribute.user_attribute_uuid,
        group_uuid: SEED_GROUP_2.groupUuid,
        value: 'true',
        values: ['true'],
    });
}
