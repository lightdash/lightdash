import { FullRedshiftCredentials } from '@lightdash/common';
import * as fs from 'fs';
import path from 'path';
import { PoolConfig } from 'pg';
import { WarehouseClient } from '../types';
import { PostgresClient } from './PostgresWarehouseClient';

const AMAZON_CA_BUNDLE = [
    fs.readFileSync(path.resolve(__dirname, './amazon-trust-ca-bundle.crt')),
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

export class RedshiftWarehouseClient
    extends PostgresClient
    implements WarehouseClient
{
    constructor(credentials: FullRedshiftCredentials) {
        const sslmode = credentials.sslmode || 'prefer';
        const ssl = getSSLConfigFromMode(sslmode);
        super(
            {
                host: encodeURIComponent(credentials.host),
                port: credentials.port,
                database: encodeURIComponent(credentials.dbname),
                user: encodeURIComponent(credentials.user),
                password: encodeURIComponent(credentials.password),
                ssl,
            },
            credentials.sshTunnel,
        );
    }
}
