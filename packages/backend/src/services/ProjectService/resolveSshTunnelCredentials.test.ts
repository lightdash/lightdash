import { ParameterError, WarehouseTypes } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { type SshKeyPairModel } from '../../models/SshKeyPairModel';
import {
    resolveSshTunnelPrivateKey,
    SSH_TUNNEL_KEY_MISSING_MESSAGE,
    SSH_TUNNEL_KEY_UNKNOWN_MESSAGE,
} from './resolveSshTunnelCredentials';

const knownKey = 'ssh-rsa AAAA-known (generated_by_lightdash_at_2026-09-04)';

const sshKeyPairModel = {
    find: vi.fn(async (publicKey: string) =>
        publicKey === knownKey ? { publicKey, privateKey: 'PRIVATE' } : null,
    ),
} as unknown as SshKeyPairModel;

const credentials = {
    type: WarehouseTypes.POSTGRES as const,
    host: 'db.internal',
    user: 'lightdash',
    password: 'secret',
    port: 5432,
    dbname: 'analytics',
    schema: 'public',
    useSshTunnel: true,
    sshTunnelHost: 'bastion.example.com',
    sshTunnelPort: 22,
    sshTunnelUser: 'ubuntu',
};

describe('resolveSshTunnelPrivateKey', () => {
    it('attaches the private key when the public key is known', async () => {
        const resolved = await resolveSshTunnelPrivateKey(sshKeyPairModel, {
            ...credentials,
            sshTunnelPublicKey: knownKey,
        });
        expect(resolved.sshTunnelPrivateKey).toBe('PRIVATE');
        expect(resolved.sshTunnelPublicKey).toBe(knownKey);
    });

    it.each([
        ['undefined', undefined],
        ['empty', ''],
        ['whitespace', '   '],
    ])(
        'rejects a %s public key with an actionable ParameterError',
        async (_label, sshTunnelPublicKey) => {
            await expect(
                resolveSshTunnelPrivateKey(sshKeyPairModel, {
                    ...credentials,
                    sshTunnelPublicKey,
                }),
            ).rejects.toThrow(
                new ParameterError(SSH_TUNNEL_KEY_MISSING_MESSAGE),
            );
        },
    );

    it('rejects a public key that is not in ssh_key_pairs with a ParameterError', async () => {
        await expect(
            resolveSshTunnelPrivateKey(sshKeyPairModel, {
                ...credentials,
                sshTunnelPublicKey: 'ssh-rsa AAAA-stale (generated elsewhere)',
            }),
        ).rejects.toThrow(new ParameterError(SSH_TUNNEL_KEY_UNKNOWN_MESSAGE));
    });
});
