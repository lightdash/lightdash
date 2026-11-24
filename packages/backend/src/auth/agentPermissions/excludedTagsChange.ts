import { ForbiddenError, type Account } from '@lightdash/common';

/** Excluded tags limit agents, so an agent connection may not change them. */
export const assertExcludedTagsChangedByPerson = (
    account: Account,
    isChangingExcludedTags: boolean,
): void => {
    if (
        isChangingExcludedTags &&
        account.authentication.type === 'oauth' &&
        account.authentication.agentConnectionGrant
    ) {
        throw new ForbiddenError(
            'Only a person can change the tags an agent may not use.',
        );
    }
};
