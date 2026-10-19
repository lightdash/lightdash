import {
    ParameterError,
    WarehouseTypes,
    type CreatePostgresCredentials,
} from '@lightdash/common';
import { createHash } from 'crypto';
import type { SshKeyPairModel } from '../../../models/SshKeyPairModel';
import {
    connectionContextFromUser,
    WarehouseCredentialKind,
} from '../ConnectionContext';
import type { CredentialSelection } from '../CredentialResolver';
import {
    SSH_TUNNEL_KEY_MISSING_MESSAGE,
    SSH_TUNNEL_KEY_UNKNOWN_MESSAGE,
    SshTunnelCredentialResolver,
} from './SshTunnelCredentialResolver';

const publicKey = 'ssh-rsa AAAA-known';
const credentials: CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'db.internal',
    user: 'lightdash',
    password: 'secret',
    port: 5432,
    dbname: 'analytics',
    schema: 'public',
    useSshTunnel: true,
    sshTunnelPublicKey: publicKey,
    sshTunnelHost: 'bastion.example.com',
    sshTunnelPort: 2222,
    sshTunnelUser: 'ubuntu',
};
const fixture = (
    overrides: Partial<CreatePostgresCredentials> = {},
    organizationUuid: string | null = 'org',
) => {
    const connection = { ...credentials, ...overrides };
    const selection: CredentialSelection<CreatePostgresCredentials> = {
        connection,
        stored: { ...connection },
        owner: null,
        context: {
            ...connectionContextFromUser(
                { userUuid: 'user' },
                { organizationUuid: 'org', queryContext: null },
            ),
            organizationUuid,
        },
        projectUuid: null,
        warehouseConnectionUuid: null,
        credentialKind: WarehouseCredentialKind.SHARED,
        aiPlan: null,
    };
    const find = vi.fn<SshKeyPairModel['find']>().mockResolvedValue({
        publicKey,
        privateKey: 'ORG-PRIVATE',
        organizationUuid: 'org',
    });
    const resolver = new SshTunnelCredentialResolver({ find });
    return {
        resolver,
        find,
        selection,
        save: { ...selection, intent: { kind: 'preserve' as const } },
    };
};

describe('SSH tunnel save validation', () => {
    it.each([undefined, '', '   '])(
        'rejects missing public key %s even with a copied key',
        async (sshTunnelPublicKey) => {
            const { resolver, save } = fixture({
                sshTunnelPublicKey,
                sshTunnelPrivateKey: 'COPY',
            });
            await expect(resolver.validateOnSave(save)).rejects.toThrow(
                new ParameterError(SSH_TUNNEL_KEY_MISSING_MESSAGE),
            );
        },
    );
    it('keeps a copied key without a lookup', async () => {
        const { resolver, save, find } = fixture({
            sshTunnelPrivateKey: 'COPY',
        });
        const result = await resolver.validateOnSave(save);
        expect(result).toEqual({
            connection: save.connection,
            stored: save.stored,
        });
        expect(find).not.toHaveBeenCalled();
    });
    it('copies the organisation key into both representations without mutation', async () => {
        const { resolver, save, find } = fixture();
        const before = structuredClone(save);
        const result = await resolver.validateOnSave(save);
        expect(result.connection.sshTunnelPrivateKey).toBe('ORG-PRIVATE');
        expect(result.stored.sshTunnelPrivateKey).toBe('ORG-PRIVATE');
        expect(find).toHaveBeenCalledExactlyOnceWith(publicKey);
        expect(save).toEqual(before);
    });
    it.each(['missing', 'other-org', 'null-owner', 'null-context'])(
        'rejects %s ownership',
        async (scenario) => {
            const { resolver, save, find } = fixture(
                {},
                scenario === 'null-context' ? null : 'org',
            );
            find.mockResolvedValue(
                scenario === 'missing'
                    ? null
                    : {
                          publicKey,
                          privateKey: 'PRIVATE',
                          organizationUuid:
                              scenario === 'other-org' ? 'other' : null,
                      },
            );
            await expect(resolver.validateOnSave(save)).rejects.toThrow(
                new ParameterError(SSH_TUNNEL_KEY_UNKNOWN_MESSAGE),
            );
        },
    );
});

describe('SSH tunnel use-time resolution', () => {
    it.each([undefined, 'STALE-COPY'])(
        'uses the organisation key over copy %s',
        async (sshTunnelPrivateKey) => {
            const { resolver, selection, find } = fixture({
                sshTunnelPrivateKey,
            });
            const before = structuredClone(selection);
            const resolved = await resolver.resolve(selection);
            expect(resolved.clientCredentials).toEqual({
                ...selection.connection,
                sshTunnelPrivateKey: 'ORG-PRIVATE',
            });
            expect(resolved.clientOptions).toEqual({});
            expect(resolved.cacheable).toBe(false);
            expect(resolver.cacheKeyIdentity(selection, resolved)).toEqual([
                'ssh-tunnel-v1',
                'org',
                'organizationKeyPair',
                createHash('sha256').update(publicKey).digest('hex'),
                'bastion.example.com',
                '2222',
                'ubuntu',
                'db.internal',
                '5432',
            ]);
            await expect(resolver.dispose(resolved)).resolves.toBeUndefined();
            expect(find).toHaveBeenCalledExactlyOnceWith(publicKey);
            expect(selection).toEqual(before);
        },
    );
    it('uses a rotated public key and ignores the old private key copy', async () => {
        const { resolver, selection, find } = fixture({
            sshTunnelPublicKey: 'NEW-PUBLIC',
            sshTunnelPrivateKey: 'OLD-PRIVATE',
        });
        find.mockResolvedValue({
            publicKey: 'NEW-PUBLIC',
            privateKey: 'NEW-PRIVATE',
            organizationUuid: 'org',
        });
        expect(
            (await resolver.resolve(selection)).clientCredentials
                .sshTunnelPrivateKey,
        ).toBe('NEW-PRIVATE');
        expect(find).toHaveBeenCalledExactlyOnceWith('NEW-PUBLIC');
    });
    it.each([
        'deleted',
        'other-org',
        'null-owner',
        'null-context',
        'blank-public',
    ])('falls back to the copied key for %s', async (scenario) => {
        const { resolver, selection, find } = fixture(
            {
                sshTunnelPrivateKey: 'COPY',
                ...(scenario === 'blank-public'
                    ? { sshTunnelPublicKey: ' ' }
                    : {}),
            },
            scenario === 'null-context' ? null : 'org',
        );
        find.mockResolvedValue(
            scenario === 'deleted'
                ? null
                : {
                      publicKey,
                      privateKey: 'UNOWNED',
                      organizationUuid:
                          scenario === 'other-org' ? 'other' : null,
                  },
        );
        const resolved = await resolver.resolve(selection);
        expect(resolved.clientCredentials.sshTunnelPrivateKey).toBe('COPY');
        expect(resolver.cacheKeyIdentity(selection, resolved)[2]).toBe(
            'copiedKey',
        );
        if (scenario === 'null-context' || scenario === 'blank-public')
            expect(find).not.toHaveBeenCalled();
    });
    it.each(['deleted', 'other-org', 'null-owner', 'null-context'])(
        'rejects %s without a copied key',
        async (scenario) => {
            const { resolver, selection, find } = fixture(
                {},
                scenario === 'null-context' ? null : 'org',
            );
            find.mockResolvedValue(
                scenario === 'deleted'
                    ? null
                    : {
                          publicKey,
                          privateKey: 'UNOWNED',
                          organizationUuid:
                              scenario === 'other-org' ? 'other' : null,
                      },
            );
            await expect(resolver.resolve(selection)).rejects.toThrow(
                new ParameterError(SSH_TUNNEL_KEY_UNKNOWN_MESSAGE),
            );
        },
    );
    it.each([undefined, '', '   '])(
        'rejects missing public key %s without a copied key',
        async (sshTunnelPublicKey) => {
            const { resolver, selection } = fixture({ sshTunnelPublicKey });
            await expect(resolver.resolve(selection)).rejects.toThrow(
                new ParameterError(SSH_TUNNEL_KEY_MISSING_MESSAGE),
            );
        },
    );
    it('uses null identity fields and the effective default SSH port', async () => {
        const { resolver, selection } = fixture(
            {
                sshTunnelPublicKey: undefined,
                sshTunnelPrivateKey: 'COPY',
                sshTunnelHost: undefined,
                sshTunnelPort: undefined,
                sshTunnelUser: undefined,
            },
            null,
        );
        const resolved = await resolver.resolve(selection);
        expect(resolver.cacheKeyIdentity(selection, resolved)).toEqual([
            'ssh-tunnel-v1',
            null,
            'copiedKey',
            null,
            null,
            '22',
            null,
            'db.internal',
            '5432',
        ]);
    });
});
