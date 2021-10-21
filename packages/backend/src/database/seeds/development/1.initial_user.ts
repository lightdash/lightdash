import { Knex } from 'knex';
import { USER_SEED } from 'common';
import { createInitialUser } from '../../entities/users';

export async function seed(knex: Knex): Promise<void> {
    // Deletes ALL existing entries
    await knex('users').del();
    await knex('organizations').del();

    // Create initial admin user
    await createInitialUser(USER_SEED);

    const orgs = await knex('organizations').select(
        'organization_id',
        'organization_name',
    );

    const projects = await knex('projects')
        .insert({
            organization_id: orgs[0].organization_id,
            name: orgs[0].organization_name,
            dbt_connection_type: null,
            dbt_connection: null,
        })
        .returning('*');

    await knex('spaces')
        .insert({
            project_id: projects[0].project_id,
            name: projects[0].name,
        })
        .returning('*');
}
