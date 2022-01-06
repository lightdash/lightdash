import { CreateRedshiftCredentials } from 'common';
import * as fs from 'fs';
import path from 'path';
import { PoolConfig } from 'pg';
import { WarehouseClient } from '../../types';
import { PostgresClient } from './PostgresWarehouseClient';

const AMAZON_CA_BUNDLE = [
    fs.readFileSync(path.resolve(__dirname, './amazon-trust-ca-bundle.crt')),
];

const sslConfigFromMode = (mode: string): PoolConfig['ssl'] => {
    switch (mode) {
        case 'disable':
            return false;
        case 'allow':
        case 'prefer':
        case 'require':
        case 'verify-ca':
            return {
                checkServerIdentity: () => undefined,
                ca: AMAZON_CA_BUNDLE,
            };
        case 'verify-full':
            return {
                ca: AMAZON_CA_BUNDLE,
            };
        default:
            throw new Error(`SSL mode "${mode}" not understood.`);
    }
};

export default class RedshiftWarehouseClient
    extends PostgresClient
    implements WarehouseClient
{
    constructor(credentials: CreateRedshiftCredentials) {
        const sslmode = credentials.sslmode || 'prefer';
        const ssl = sslConfigFromMode(sslmode);
        super({
            connectionString: `postgres://${credentials.user}:${credentials.password}@${credentials.host}:${credentials.port}/${credentials.dbname}`,
            ssl,
        });
    }
}
