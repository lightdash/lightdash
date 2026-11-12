import {
    AGENT_CLIENT_IDS,
    type RegisteredAccount,
    type SessionUser,
} from '@lightdash/common';
import { fromSession } from '../../../auth/account/account';

const agentClientIds = new Set<string>(
    Object.values(AGENT_CLIENT_IDS).filter(
        (clientId): clientId is NonNullable<typeof clientId> =>
            clientId !== null,
    ),
);

export const isPersonOwnBearerAccount = (
    account: RegisteredAccount,
): boolean => {
    switch (account.authentication.type) {
        case 'pat':
            return true;
        case 'oauth':
            return (
                account.authentication.agentConnectionGrant == null &&
                !agentClientIds.has(account.authentication.clientId)
            );
        default:
            return false;
    }
};

export const getArtifactRunAccount = (
    user: SessionUser,
    callerAccount: RegisteredAccount | undefined,
): RegisteredAccount =>
    callerAccount !== undefined &&
    callerAccount.user.id === user.userUuid &&
    isPersonOwnBearerAccount(callerAccount)
        ? callerAccount
        : fromSession(user);
