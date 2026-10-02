import { SignInSubjectBasis, type SharedSignInExpiry } from '@lightdash/common';
import { type QueryClient } from '@tanstack/react-query';
import { type UserWithAbility } from '../user/useUser';

export const sharedSignInSettingsHref = (
    expiry: SharedSignInExpiry,
    queryClient: QueryClient | undefined,
): string | null => {
    const userUuid = queryClient?.getQueryData<UserWithAbility>([
        'user',
    ])?.userUuid;
    if (
        !userUuid ||
        expiry.subjectUserUuid !== userUuid ||
        (expiry.subjectBasis !== SignInSubjectBasis.RECORDED &&
            expiry.subjectBasis !== SignInSubjectBasis.PROJECT_CREATOR)
    )
        return null;
    return `/generalSettings/projectManagement/${expiry.projectUuid}/settings`;
};
