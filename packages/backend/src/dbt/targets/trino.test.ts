import { WarehouseTypes, type CreateTrinoCredentials } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { trinoTarget } from './trino';

const credentials: CreateTrinoCredentials = {
    type: WarehouseTypes.TRINO,
    host: 'trino.internal',
    user: 'analyst',
    password: 'secret',
    port: 443,
    dbname: 'hive',
    schema: 'analytics',
    http_scheme: 'https',
};

describe('trinoTarget', () => {
    it('uses ldap with the password when one is set', () => {
        expect(
            trinoTarget(credentials, { explicitCredentials: false }),
        ).toEqual({
            kind: 'target',
            target: {
                type: WarehouseTypes.TRINO,
                host: 'trino.internal',
                method: 'ldap',
                user: "{{ env_var('LIGHTDASH_DBT_PROFILE_VAR_USER') }}",
                password: "{{ env_var('LIGHTDASH_DBT_PROFILE_VAR_PASSWORD') }}",
                port: 443,
                database: 'hive',
                schema: 'analytics',
                http_scheme: 'https',
            },
            environment: {
                LIGHTDASH_DBT_PROFILE_VAR_USER: 'analyst',
                LIGHTDASH_DBT_PROFILE_VAR_PASSWORD: 'secret',
            },
        });
    });

    it('uses no authentication when the password is empty', () => {
        expect(
            trinoTarget(
                { ...credentials, password: '', http_scheme: 'http' },
                { explicitCredentials: false },
            ),
        ).toEqual({
            kind: 'target',
            target: {
                type: WarehouseTypes.TRINO,
                host: 'trino.internal',
                method: 'none',
                user: "{{ env_var('LIGHTDASH_DBT_PROFILE_VAR_USER') }}",
                port: 443,
                database: 'hive',
                schema: 'analytics',
                http_scheme: 'http',
            },
            environment: { LIGHTDASH_DBT_PROFILE_VAR_USER: 'analyst' },
        });
    });
});
