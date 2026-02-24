import { Knex } from 'knex';
import { OpenIdIdentitiesTableName } from '../entities/openIdIdentities';
import { PasswordLoginTableName } from '../entities/passwordLogins';
import { UserTableName } from '../entities/users';

export async function up(knex: Knex): Promise<void> {
    await knex('users').update({
        is_active: true,
    });
}

export async function down(knex: Knex): Promise<void> {
    const users = await knex(UserTableName)
        .leftJoin(
            PasswordLoginTableName,
            `${UserTableName}.user_id`,
            `${PasswordLoginTableName}.user_id`,
        )
        .leftJoin(
            OpenIdIdentitiesTableName,
            `${UserTableName}.user_id`,
            `${OpenIdIdentitiesTableName}.user_id`,
        )
        .select<
            { user_id: string; user_uuid: string; has_authentication: false }[]
        >(
            `${UserTableName}.user_id`,
            knex.raw(
                `CASE WHEN COALESCE(password_logins.user_id, openid_identities.user_id, null) IS NOT NULL THEN TRUE ELSE FALSE END as has_authentication`,
            ),
        )
        .distinctOn(`user_id`);
    const queries: Promise<number>[] = [];
    users.forEach((user) => {
        queries.push(
            knex('users')
                .update({
                    is_active: user.has_authentication,
                })
                .where('user_id', user.user_id),
        );
    });
    await Promise.all(queries);
}
