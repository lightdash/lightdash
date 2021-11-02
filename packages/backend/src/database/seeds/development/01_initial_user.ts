import { Knex } from 'knex';
import bcrypt from 'bcrypt';
import {
    SEED_EMAIL,
    SEED_ORGANIZATION,
    SEED_ORGANIZATION_MEMBERSHIP,
    SEED_PASSWORD,
    SEED_USER,
} from 'common';

export async function seed(knex: Knex): Promise<void> {
    // Deletes ALL existing entries
    await knex('users').del();
    await knex('organizations').del();

    await knex('organizations').insert(SEED_ORGANIZATION);

    await knex('users').insert(SEED_USER);

    await knex('emails').insert(SEED_EMAIL);

    await knex('password_logins').insert({
        user_id: SEED_PASSWORD.user_id,
        password_hash: await bcrypt.hash(
            SEED_PASSWORD.password,
            await bcrypt.genSalt(),
        ),
    });

    await knex('organization_memberships').insert(SEED_ORGANIZATION_MEMBERSHIP);
}
