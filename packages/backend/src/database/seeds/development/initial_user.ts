import { Knex } from 'knex';
import { USER_SEED } from 'common';
import { createInitialUser } from '../../entities/users';

export async function seed(knex: Knex): Promise<void> {
    // Deletes ALL existing entries
    await knex('users').del();
    await knex('organizations').del();

    // Create initial admin user
    await createInitialUser(USER_SEED);
}
