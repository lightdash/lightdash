import {
    ParameterError,
    type CreatePostgresCredentials,
    type CreateRedshiftCredentials,
} from '@lightdash/common';
import { type SshKeyPairModel } from '../../models/SshKeyPairModel';

type SshTunnelCredentials =
    | CreatePostgresCredentials
    | CreateRedshiftCredentials;

export const SSH_TUNNEL_KEY_MISSING_MESSAGE =
    'SSH tunnel is enabled but no public key has been generated. Click "Generate public key", add the key to your SSH host, then save again.';

export const SSH_TUNNEL_KEY_UNKNOWN_MESSAGE =
    'The SSH public key on this connection is not recognised. Click "Regenerate key", add the new key to your SSH host, then save again.';

/**
 * Attaches the private key for the connection's SSH public key when the
 * connection doesn't carry one yet. Key pairs are looked up within
 * `organizationUuid`, the organization that owns the connection.
 */
export const resolveSshTunnelPrivateKey = async <
    T extends SshTunnelCredentials,
>(
    sshKeyPairModel: Pick<SshKeyPairModel, 'find'>,
    credentials: T,
    organizationUuid: string,
): Promise<T & { sshTunnelPrivateKey: string }> => {
    const publicKey = credentials.sshTunnelPublicKey ?? '';
    if (publicKey.trim() === '') {
        throw new ParameterError(SSH_TUNNEL_KEY_MISSING_MESSAGE);
    }
    const sshTunnelPrivateKey = credentials.sshTunnelPrivateKey ?? '';
    if (sshTunnelPrivateKey !== '') {
        return { ...credentials, sshTunnelPrivateKey };
    }
    const keyPair = await sshKeyPairModel.find(publicKey);
    if (keyPair === null || keyPair.organizationUuid !== organizationUuid) {
        throw new ParameterError(SSH_TUNNEL_KEY_UNKNOWN_MESSAGE);
    }
    return { ...credentials, sshTunnelPrivateKey: keyPair.privateKey };
};
