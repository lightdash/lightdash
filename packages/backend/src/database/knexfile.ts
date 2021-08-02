/**
 * Switch behaviour of database connector depending on environment
 */
import { parse } from 'pg-connection-string';
import { lightdashConfig } from '../config/lightdashConfig';

const CONNECTION = lightdashConfig.databaseConnectionUri
    ? parse(lightdashConfig.databaseConnectionUri)
    : {};

export const development = {
    client: 'pg',
    connection: CONNECTION,
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
