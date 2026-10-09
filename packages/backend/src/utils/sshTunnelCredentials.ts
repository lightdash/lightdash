import {
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import type { SshKeyPairModel } from '../models/SshKeyPairModel';

export const findOwnedSshKeyPair = async (
    model: Pick<SshKeyPairModel, 'find'>,
    publicKey: string,
    organizationUuid: string | null,
) => {
    if (organizationUuid === null || publicKey.trim() === '') return null;
    const pair = await model.find(publicKey);
    return pair?.organizationUuid === organizationUuid ? pair : null;
};

export const hasSshTunnelPrivateKey = (
    credentials: CreateWarehouseCredentials,
) =>
    (credentials.type === WarehouseTypes.POSTGRES ||
        credentials.type === WarehouseTypes.REDSHIFT) &&
    credentials.sshTunnelPrivateKey !== undefined;

export const stripOwnedSshTunnelPrivateKey = async (
    model: Pick<SshKeyPairModel, 'find'>,
    credentials: CreateWarehouseCredentials,
    organizationUuid: string | null,
): Promise<CreateWarehouseCredentials> => {
    if (
        (credentials.type !== WarehouseTypes.POSTGRES &&
            credentials.type !== WarehouseTypes.REDSHIFT) ||
        !hasSshTunnelPrivateKey(credentials) ||
        !(await findOwnedSshKeyPair(
            model,
            credentials.sshTunnelPublicKey ?? '',
            organizationUuid,
        ))
    )
        return credentials;
    const stored = { ...credentials };
    delete stored.sshTunnelPrivateKey;
    return stored;
};
