// Update with your config settings.

export const development = {
    client: 'pg',
    connection: {
        host: process.env.LIGHTDASH_DB_HOST,
        port: parseInt(process.env.LIGHTDASHDB_PORT || '', 10),
        database: process.env.LIGHTDASH_DB_DATABASE,
        user: process.env.LIGHTDASH_DB_USER,
        password: process.env.LIGHTDASH_DB_PASSWORD,
        charset: 'utf8',
    },
    pool: {
        min: 2,
        max: 10,
    },
    migrations: {
        tableName: 'knex_migrations',
        // schemaName: 'lightdash',  # subschema later
        extension: 'ts',
    },
    seeds: {
        directory: './seeds/development',
    },
};

export const production = {
    client: 'pg',
    connection: {
        host: process.env.LIGHTDASH_DB_HOST,
        port: parseInt(process.env.LIGHTDASHDB_PORT || '', 10),
        database: process.env.LIGHTDASH_DB_DATABASE,
        user: process.env.LIGHTDASH_DB_USER,
        password: process.env.LIGHTDASH_DB_PASSWORD,
        charset: 'utf8',
    },
    pool: {
        min: 2,
        max: 10,
    },
    migrations: {
        tableName: 'knex_migrations',
        // schemaName: 'lightdash',  # subschema later
        extension: 'ts',
    },
};
