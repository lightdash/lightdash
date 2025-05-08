import { Knex } from 'knex';

const TABLES = [
    'Session',
    'AccessToken',
    'AuthorizationCode',
    'RefreshToken',
    'DeviceCode',
    'ClientCredentials',
    'Client',
    'InitialAccessToken',
    'RegistrationAccessToken',
    'Interaction',
    'ReplayDetection',
    'Grant',
    'BackchannelAuthenticationRequest',
];

export async function up(knex: Knex): Promise<void> {
    await Promise.all(
        TABLES.map(async (table) => {
            if (!(await knex.schema.hasTable(table))) {
                await knex.schema.createTable(table, (t) => {
                    t.string('id').primary();
                    t.jsonb('payload').notNullable();
                    t.timestamp('expires_at', { useTz: false }).nullable();
                    if (
                        [
                            'AccessToken',
                            'AuthorizationCode',
                            'RefreshToken',
                            'DeviceCode',
                            'BackchannelAuthenticationRequest',
                        ].includes(table)
                    ) {
                        t.string('grant_id').index();
                    }
                    if (['DeviceCode'].includes(table)) {
                        t.string('user_code').unique().index();
                    }
                    if (['Session'].includes(table)) {
                        t.string('uid').unique().index();
                    }
                });
            }
        }),
    );
}

export async function down(knex: Knex): Promise<void> {
    await Promise.all(
        TABLES.map((table) => knex.schema.dropTableIfExists(table)),
    );
}
