/**
 * Switch behaviour of database connector depending on environment
 */
import { Knex } from 'knex';
import path from 'path';
import knexConfig from '../../knexfile';

const development: Knex.Config<Knex.PgConnectionConfig> = {
    ...knexConfig.development,
    migrations: {
        directory: [
            path.join(__dirname, './database/migrations'),
            path.join(__dirname, './ee/database/migrations'),
        ],
        tableName: 'knex_migrations',
        extension: 'ts',
        loadExtensions: ['.ts'],
    },
    seeds: {
        directory: [
            path.join(__dirname, './database/seeds/development'),
            path.join(__dirname, './ee/database/seeds/development'),
        ],
        loadExtensions: ['.ts'],
    },
};

const production: Knex.Config<Knex.PgConnectionConfig> = {
    ...development,
    migrations: {
        ...development.migrations,
        loadExtensions: ['.js'],
    },
    seeds: {
        ...development.seeds,
        loadExtensions: ['.js'],
    },
};

export default {
    development,
    production,
};
