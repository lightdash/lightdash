/**
 * Switch behaviour of database connector depending on environment
 */
import { Knex } from 'knex';
import path from 'path';
import { parse } from 'pg-connection-string';
import { lightdashConfig } from '../config/lightdashConfig';

const CONNECTION = lightdashConfig.database.connectionUri
    ? parse(lightdashConfig.database.connectionUri)
    : {};

export const development: Knex.Config = {
    client: 'pg',
    connection: CONNECTION,
    pool: {
        min: lightdashConfig.database.minConnections || 1,
        max: lightdashConfig.database.maxConnections || 10,
    },
    migrations: {
        directory: path.join(__dirname, './migrations'),
        tableName: 'knex_migrations',
        extension: 'ts',
        loadExtensions: ['.ts'],
    },
    seeds: {
        directory: './seeds/development',
        loadExtensions: ['.ts'],
    },
};

export const production: Knex.Config = {
    ...development,
    migrations: {
        directory: path.join(__dirname, './migrations'),
        tableName: 'knex_migrations',
        loadExtensions: ['.js'],
    },
    seeds: {
        directory: './seeds/development',
        loadExtensions: ['.js'],
    },
};
