import { SEED_ORG_1_ADMIN, SEED_PAT } from '@lightdash/common';
import { Knex } from 'knex';
import { hash } from '../../../utils/hash';
import { PersonalAccessTokenTableName } from '../../entities/personalAccessTokens';

export async function seed(knex: Knex): Promise<void> {
    // Clean existing PATs for the admin user
    const [user] = await knex('users')
        .where('user_uuid', SEED_ORG_1_ADMIN.user_uuid)
        .select('user_id');

    if (!user) return;

    await knex(PersonalAccessTokenTableName)
        .where('created_by_user_id', user.user_id)
        .del();

    const tokenHash = await hash(SEED_PAT.token);

    await knex(PersonalAccessTokenTableName).insert({
        created_by_user_id: user.user_id,
        description: SEED_PAT.description,
        token_hash: tokenHash,
        expires_at: null, // never expires
    });
}
