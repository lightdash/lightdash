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
    'The SSH public key on this connection is not recognised by Lightdash. Click "Regenerate key", add the new key to your SSH host, then save again.';

export const resolveSshTunnelPrivateKey = async <
    T extends SshTunnelCredentials,
>(
    sshKeyPairModel: SshKeyPairModel,
    credentials: T,
): Promise<T & { sshTunnelPrivateKey: string }> => {
    const publicKey = credentials.sshTunnelPublicKey ?? '';
    if (publicKey.trim() === '') {
        throw new ParameterError(SSH_TUNNEL_KEY_MISSING_MESSAGE);
    }
    const keyPair = await sshKeyPairModel.find(publicKey);
    if (keyPair === null) {
        throw new ParameterError(SSH_TUNNEL_KEY_UNKNOWN_MESSAGE);
    }
    return { ...credentials, sshTunnelPrivateKey: keyPair.privateKey };
};
