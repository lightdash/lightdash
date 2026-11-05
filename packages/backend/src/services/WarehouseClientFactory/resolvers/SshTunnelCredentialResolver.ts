import {
    ParameterError,
    WarehouseTypes,
    type CreatePostgresCredentials,
    type CreateRedshiftCredentials,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { createHash } from 'crypto';
import { toDbtTarget } from '../../../dbt/targets';
import type { SshKeyPairModel } from '../../../models/SshKeyPairModel';
import type {
    CredentialResolution,
    CredentialResolver,
    CredentialSaveInput,
    CredentialSelection,
    DbtTargetPolicy,
    DbtTargetResult,
    ValidatedCredential,
} from '../CredentialResolver';

type SshTunnelCredentials =
    | CreatePostgresCredentials
    | CreateRedshiftCredentials;
type SshTunnelResolution = CredentialResolution<SshTunnelCredentials> & {
    source: 'organizationKeyPair' | 'copiedKey';
};

export const SSH_TUNNEL_KEY_MISSING_MESSAGE =
    'SSH tunnel is enabled but no public key has been generated. Click "Generate public key", add the key to your SSH host, then save again.';

export const SSH_TUNNEL_KEY_UNKNOWN_MESSAGE =
    'The SSH public key on this connection is not recognised. Click "Regenerate key", add the new key to your SSH host, then save again.';

export class SshTunnelCredentialResolver implements CredentialResolver<SshTunnelCredentials> {
    constructor(
        private readonly sshKeyPairModel: Pick<SshKeyPairModel, 'find'>,
    ) {}

    static matches(
        credentials: CreateWarehouseCredentials,
    ): credentials is SshTunnelCredentials {
        return (
            (credentials.type === WarehouseTypes.POSTGRES ||
                credentials.type === WarehouseTypes.REDSHIFT) &&
            credentials.useSshTunnel === true
        );
    }

    async validateOnSave(
        input: CredentialSaveInput<SshTunnelCredentials>,
    ): Promise<ValidatedCredential<SshTunnelCredentials>> {
        const { connection, stored, context } = input;
        const publicKey = connection.sshTunnelPublicKey ?? '';
        if (publicKey.trim() === '')
            throw new ParameterError(SSH_TUNNEL_KEY_MISSING_MESSAGE);
        let privateKey = connection.sshTunnelPrivateKey ?? '';
        if (privateKey === '') {
            const keyPair = await this.sshKeyPairModel.find(publicKey);
            if (
                context.organizationUuid === null ||
                !keyPair ||
                keyPair.organizationUuid !== context.organizationUuid
            ) {
                throw new ParameterError(SSH_TUNNEL_KEY_UNKNOWN_MESSAGE);
            }
            privateKey = keyPair.privateKey;
        }
        return {
            connection: { ...connection, sshTunnelPrivateKey: privateKey },
            stored: { ...stored, sshTunnelPrivateKey: privateKey },
        };
    }

    async resolve(
        input: CredentialSelection<SshTunnelCredentials>,
    ): Promise<SshTunnelResolution> {
        const { connection, context } = input;
        const publicKey = connection.sshTunnelPublicKey ?? '';
        const copiedKey = connection.sshTunnelPrivateKey ?? '';
        if (publicKey.trim() === '' && copiedKey === '')
            throw new ParameterError(SSH_TUNNEL_KEY_MISSING_MESSAGE);
        const keyPair =
            publicKey.trim() !== '' && context.organizationUuid !== null
                ? await this.sshKeyPairModel.find(publicKey)
                : null;
        const ownedKeyPair =
            keyPair !== null &&
            context.organizationUuid !== null &&
            keyPair.organizationUuid === context.organizationUuid
                ? keyPair
                : null;
        if (ownedKeyPair === null && copiedKey === '')
            throw new ParameterError(SSH_TUNNEL_KEY_UNKNOWN_MESSAGE);
        return {
            clientCredentials: {
                ...connection,
                sshTunnelPrivateKey: ownedKeyPair?.privateKey ?? copiedKey,
            },
            clientOptions: {},
            agentSignIn: null,
            cacheable: false,
            source: ownedKeyPair === null ? 'copiedKey' : 'organizationKeyPair',
        };
    }

    cacheKeyIdentity(
        input: CredentialSelection<SshTunnelCredentials>,
        resolved: SshTunnelResolution,
    ): readonly (string | null)[] {
        const { clientCredentials: connection } = resolved;
        const publicKey = connection.sshTunnelPublicKey;
        return [
            'ssh-tunnel-v1',
            input.context.organizationUuid,
            resolved.source,
            publicKey?.trim()
                ? createHash('sha256').update(publicKey).digest('hex')
                : null,
            connection.sshTunnelHost ?? null,
            String(connection.sshTunnelPort || 22),
            connection.sshTunnelUser ?? null,
            connection.host ?? null,
            connection.port === undefined ? null : String(connection.port),
        ];
    }

    toDbtTarget(
        _resolved: CredentialResolution<SshTunnelCredentials>,
        finalConnection: SshTunnelCredentials,
        policy: DbtTargetPolicy,
    ): DbtTargetResult {
        return toDbtTarget(finalConnection, policy);
    }

    async dispose(_resolved: SshTunnelResolution): Promise<void> {}
}
