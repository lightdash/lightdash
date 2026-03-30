import { Knex } from 'knex';

const PROJECT_MEMBERS_GROUP_UUID = '00000000-0000-0000-0000-000000000000';

export async function up(knex: Knex): Promise<void> {
    // Insert a sentinel group record so the FK on space_group_access is
    // satisfied. The sentinel has no members in group_memberships — the
    // permission system expands it dynamically to all project members.
    const [firstOrg] = await knex('organizations')
        .select('organization_id')
        .limit(1);
    if (!firstOrg) return;

    await knex('groups')
        .insert({
            group_uuid: PROJECT_MEMBERS_GROUP_UUID,
            organization_id: firstOrg.organization_id,
            name: 'All project members',
        })
        .onConflict('group_uuid')
        .ignore();
}

export async function down(knex: Knex): Promise<void> {
    await knex('space_group_access')
        .where('group_uuid', PROJECT_MEMBERS_GROUP_UUID)
        .delete();
    await knex('groups')
        .where('group_uuid', PROJECT_MEMBERS_GROUP_UUID)
        .delete();
}
