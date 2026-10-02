import {
    isJwtUser,
    type Account,
    type AnonymousAccount,
} from '@lightdash/common';

export const isAiAgentEmbedAccount = (
    account: Account,
): account is AnonymousAccount =>
    isJwtUser(account) &&
    account.authentication.data.content.type === 'aiAgent';
