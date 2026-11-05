import {
    RedshiftAuthenticationType,
    WarehouseTypes,
    type CreatePostgresCredentials,
    type CreateRedshiftCredentials,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { inheritUpstreamSshTunnelPrivateKey } from './inheritUpstreamSshTunnelPrivateKey';

const tunnel = {
    useSshTunnel: true,
    sshTunnelHost: 'bastion.example.com',
    sshTunnelPort: 22,
    sshTunnelUser: 'tunnel',
    sshTunnelPublicKey: 'ssh-ed25519 shared-public-key',
};
const upstreamSecrets = {
    password: 'parent-password',
    accessKeyId: 'parent-access-key',
    secretAccessKey: 'parent-secret-key',
    sessionToken: 'parent-session-token',
    sshTunnelPrivateKey: 'parent-private-key',
};

const postgres: CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'warehouse.example.com',
    port: 5432,
    dbname: 'analytics',
    schema: 'preview',
    user: 'developer',
    password: 'fresh-password',
    ...tunnel,
};
const redshiftIam: CreateRedshiftCredentials = {
    type: WarehouseTypes.REDSHIFT,
    host: 'cluster.example.com',
    port: 5439,
    dbname: 'analytics',
    schema: 'preview',
    user: 'developer',
    authenticationType: RedshiftAuthenticationType.IAM,
    region: 'eu-west-1',
    clusterIdentifier: 'cluster',
    accessKeyId: 'fresh-access-key',
    secretAccessKey: 'fresh-secret-key',
    sessionToken: 'fresh-session-token',
    ...tunnel,
};

describe.each([
    ['Postgres', postgres],
    ['Redshift IAM', redshiftIam],
] as const)('inheritUpstreamSshTunnelPrivateKey for %s', (_name, merged) => {
    const upstream = {
        ...merged,
        ...upstreamSecrets,
    } as CreateWarehouseCredentials;
    const expectNoOtherUpstreamSecret = (result: CreateWarehouseCredentials) =>
        expect(JSON.stringify(result)).not.toMatch(
            /parent-(password|access-key|secret-key|session-token)/,
        );

    it('carries the private key for the same inherited public key', () => {
        const result = inheritUpstreamSshTunnelPrivateKey(merged, upstream);
        expect(result).toEqual({
            ...merged,
            sshTunnelPrivateKey: 'parent-private-key',
        });
        expectNoOtherUpstreamSecret(result);
    });

    it('treats an empty private key as missing', () => {
        expect(
            inheritUpstreamSshTunnelPrivateKey(
                { ...merged, sshTunnelPrivateKey: '' },
                upstream,
            ).sshTunnelPrivateKey,
        ).toBe('parent-private-key');
    });

    it('compares public keys after trimming', () => {
        expect(
            inheritUpstreamSshTunnelPrivateKey(merged, {
                ...upstream,
                sshTunnelPublicKey: `  ${tunnel.sshTunnelPublicKey}\n`,
            } as CreateWarehouseCredentials).sshTunnelPrivateKey,
        ).toBe('parent-private-key');
    });

    it.each([
        ['an explicit default tunnel port', {}, { sshTunnelPort: undefined }],
        [
            'a warehouse host differing by case and trailing dot',
            {},
            { host: `${merged.host.toUpperCase()}.` },
        ],
        [
            'a missing and an empty tunnel user',
            { sshTunnelUser: undefined },
            { sshTunnelUser: '' },
        ],
        ['a padded tunnel user', {}, { sshTunnelUser: ' tunnel ' }],
    ])('carries the key across %s', (_case, mergedPatch, upPatch) => {
        const input = { ...merged, ...mergedPatch };
        const result = inheritUpstreamSshTunnelPrivateKey(input, {
            ...upstream,
            ...upPatch,
        } as CreateWarehouseCredentials);
        expect(result).toEqual({
            ...input,
            sshTunnelPrivateKey: 'parent-private-key',
        });
        expectNoOtherUpstreamSecret(result);
    });

    it.each([
        [
            'the preview has its own private key',
            { sshTunnelPrivateKey: 'preview-private-key' },
            {},
        ],
        [
            'the public keys differ',
            { sshTunnelPublicKey: 'ssh-ed25519 old-public-key' },
            {},
        ],
        ['the public key is blank', { sshTunnelPublicKey: '  ' }, {}],
        [
            'the tunnel host changed',
            { sshTunnelHost: 'other-bastion.example.com' },
            {},
        ],
        ['the tunnel port changed', { sshTunnelPort: 2222 }, {}],
        ['the tunnel user changed', { sshTunnelUser: 'other-user' }, {}],
        [
            'the tunnel user is missing on one side',
            { sshTunnelUser: undefined },
            {},
        ],
        ['the warehouse host changed', { host: 'moved.example.com' }, {}],
        ['the warehouse port changed', { port: 6543 }, {}],
        ['the public key is missing', { sshTunnelPublicKey: undefined }, {}],
        ['the preview does not use a tunnel', { useSshTunnel: false }, {}],
        ['the upstream does not use a tunnel', {}, { useSshTunnel: false }],
        ['the upstream has no private key', {}, { sshTunnelPrivateKey: '' }],
        [
            'the upstream private key is missing',
            {},
            { sshTunnelPrivateKey: undefined },
        ],
    ])('returns the input unchanged when %s', (_case, mergedPatch, upPatch) => {
        const input = { ...merged, ...mergedPatch };
        const result = inheritUpstreamSshTunnelPrivateKey(input, {
            ...upstream,
            ...upPatch,
        } as CreateWarehouseCredentials);
        expect(result).toBe(input);
        expectNoOtherUpstreamSecret(result);
    });
});

describe('inheritUpstreamSshTunnelPrivateKey across warehouse types', () => {
    it('does not carry a key between Postgres and Redshift', () => {
        const upstream = {
            ...redshiftIam,
            ...upstreamSecrets,
        } as CreateWarehouseCredentials;
        expect(inheritUpstreamSshTunnelPrivateKey(postgres, upstream)).toBe(
            postgres,
        );
    });

    it('ignores warehouses without SSH tunnels', () => {
        const snowflake: CreateWarehouseCredentials = {
            type: WarehouseTypes.SNOWFLAKE,
            account: 'account',
            user: 'developer',
            password: 'fresh-password',
            database: 'analytics',
            warehouse: 'compute',
            schema: 'preview',
        };
        expect(
            inheritUpstreamSshTunnelPrivateKey(snowflake, {
                ...postgres,
                ...upstreamSecrets,
            }),
        ).toBe(snowflake);
    });

    it('accepts credentials with omitted secrets', () => {
        const { password, ...withoutPassword } = postgres;
        expect(
            inheritUpstreamSshTunnelPrivateKey(withoutPassword, {
                ...postgres,
                ...upstreamSecrets,
            }),
        ).toEqual({
            ...withoutPassword,
            sshTunnelPrivateKey: 'parent-private-key',
        });
    });
});
