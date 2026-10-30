import {
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type CreateWarehouseCredentialsWithOptionalSecrets,
} from '@lightdash/common';
import { hasSameWarehouseCredentialDestination } from './credentialDestination';

/**
 * Reuses the upstream private key for a preview that inherits the same tunnel.
 * A public key is not a secret, so it grants no authority by itself: the key is
 * carried only to the upstream's own warehouse destination, tunnel endpoint and
 * tunnel user, the same boundary mergeMissingWarehouseSecrets applies to a
 * saved key. A changed destination is intentionally not covered.
 */
export const inheritUpstreamSshTunnelPrivateKey = <
    T extends CreateWarehouseCredentialsWithOptionalSecrets,
>(
    merged: T,
    upstream: CreateWarehouseCredentials,
): T => {
    const connection: CreateWarehouseCredentialsWithOptionalSecrets = merged;
    if (
        (connection.type !== WarehouseTypes.POSTGRES &&
            connection.type !== WarehouseTypes.REDSHIFT) ||
        (upstream.type !== WarehouseTypes.POSTGRES &&
            upstream.type !== WarehouseTypes.REDSHIFT) ||
        upstream.type !== connection.type ||
        connection.useSshTunnel !== true ||
        upstream.useSshTunnel !== true
    ) {
        return merged;
    }
    const publicKey = connection.sshTunnelPublicKey?.trim() ?? '';
    const upstreamPrivateKey = upstream.sshTunnelPrivateKey ?? '';
    if (
        publicKey === '' ||
        publicKey !== (upstream.sshTunnelPublicKey?.trim() ?? '') ||
        (connection.sshTunnelPrivateKey ?? '') !== '' ||
        upstreamPrivateKey === '' ||
        (connection.sshTunnelUser?.trim() ?? '') !==
            (upstream.sshTunnelUser?.trim() ?? '') ||
        !hasSameWarehouseCredentialDestination(connection, upstream)
    ) {
        return merged;
    }
    return { ...merged, sshTunnelPrivateKey: upstreamPrivateKey };
};
