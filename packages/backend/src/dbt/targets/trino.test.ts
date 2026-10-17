import { WarehouseTypes, type CreateTrinoCredentials } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { profileFromTarget } from '../profiles';
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

const passwordless: CreateTrinoCredentials = {
    ...credentials,
    password: '',
    http_scheme: 'http',
};

const flagOff = { explicitCredentials: false, trinoPasswordlessAuth: false };
const flagOn = { explicitCredentials: false, trinoPasswordlessAuth: true };

const mainLdapTarget = (password: string, httpScheme: string) => ({
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
        http_scheme: httpScheme,
    },
    environment: {
        LIGHTDASH_DBT_PROFILE_VAR_USER: 'analyst',
        LIGHTDASH_DBT_PROFILE_VAR_PASSWORD: password,
    },
});

const mainPasswordlessProfile = `lightdash_profile:
  target: prod
  outputs:
    prod:
      type: trino
      host: trino.internal
      method: ldap
      user: '{{ env_var(''LIGHTDASH_DBT_PROFILE_VAR_USER'') }}'
      password: '{{ env_var(''LIGHTDASH_DBT_PROFILE_VAR_PASSWORD'') }}'
      port: 443
      database: hive
      schema: analytics
      http_scheme: http
`;

describe('trinoTarget', () => {
    describe('with mixed warehouse connections off', () => {
        it('uses ldap with the password, as on main', () => {
            expect(trinoTarget(credentials, flagOff)).toEqual(
                mainLdapTarget('secret', 'https'),
            );
        });

        it('keeps ldap for an empty password, as on main', () => {
            expect(trinoTarget(passwordless, flagOff)).toEqual(
                mainLdapTarget('', 'http'),
            );
        });

        it('writes the same dbt profile as main for an empty password', () => {
            const { profile, environment } = profileFromTarget(
                trinoTarget(passwordless, flagOff),
                undefined,
            );
            expect(profile).toBe(mainPasswordlessProfile);
            expect(environment).toEqual({
                LIGHTDASH_DBT_PROFILE_VAR_USER: 'analyst',
                LIGHTDASH_DBT_PROFILE_VAR_PASSWORD: '',
            });
        });
    });

    describe('with mixed warehouse connections on', () => {
        it('uses ldap with the password when one is set', () => {
            expect(trinoTarget(credentials, flagOn)).toEqual(
                mainLdapTarget('secret', 'https'),
            );
        });

        it('uses no authentication when the password is empty', () => {
            expect(trinoTarget(passwordless, flagOn)).toEqual({
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
});
