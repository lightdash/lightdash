import { InviteLinkFailureReason } from '../types/api';

export const getInviteLinkFailureReason = (
    errorName: string | null,
    message: string,
): InviteLinkFailureReason | null => {
    if (errorName === 'ExpiredError') return InviteLinkFailureReason.Expired;
    if (errorName === 'NotFoundError') return InviteLinkFailureReason.NotFound;
    if (
        (errorName === 'AuthorizationError' || errorName === null) &&
        message.includes('does not match the invited email')
    ) {
        return InviteLinkFailureReason.WrongEmail;
    }
    return null;
};
