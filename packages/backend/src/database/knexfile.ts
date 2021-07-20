/**
 * Switch behaviour of database connector depending on environment
 */

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
        extension: 'ts',
        loadExtensions: ['.ts'],
    },
    seeds: {
        directory: './seeds/development',
        loadExtensions: ['.ts'],
    },
};

export const production = {
    ...development,
    migrations: {
        tableName: 'knex_migrations',
        loadExtensions: ['.js'],
    },
    seeds: {
        directory: './seeds/development',
        loadExtensions: ['.js'],
    },
};
