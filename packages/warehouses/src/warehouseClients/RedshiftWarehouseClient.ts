import { CreateRedshiftCredentials } from '@lightdash/common';
import * as fs from 'fs';
import path from 'path';
import { PoolConfig } from 'pg';
import { PostgresClient } from './PostgresWarehouseClient';

const AMAZON_CA_BUNDLE = [
    fs.readFileSync(path.resolve(__dirname, './ca-bundle-aws-redshift.crt')),
];

const getSSLConfigFromMode = (mode: string): PoolConfig['ssl'] => {
    switch (mode) {
        case 'disable':
            return false;
        case 'no-verify':
            return {
                rejectUnauthorized: false,
            };
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

export class RedshiftWarehouseClient extends PostgresClient<CreateRedshiftCredentials> {
    constructor(credentials: CreateRedshiftCredentials) {
        const sslmode = credentials.sslmode || 'prefer';
        const ssl = getSSLConfigFromMode(sslmode);
        super(credentials, {
            connectionString: `postgres://${encodeURIComponent(
                credentials.user,
            )}:${encodeURIComponent(credentials.password)}@${encodeURIComponent(
                credentials.host,
            )}:${credentials.port}/${encodeURIComponent(credentials.dbname)}`,
            ssl,
        });
    }
}
