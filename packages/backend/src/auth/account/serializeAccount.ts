import { type Account, type SerializedAccount } from '@lightdash/common';

export const serializeAccount = (account: Account): SerializedAccount => {
    const { ability: _ability, ...user } = account.user;
    return {
        organization: account.organization,
        authentication: { type: account.authentication.type },
        user,
        embedWriteContext:
            'embedWriteContext' in account
                ? account.embedWriteContext
                : undefined,
    };
};
