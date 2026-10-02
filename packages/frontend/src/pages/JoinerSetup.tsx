import { useEffect, useRef, type FC } from 'react';
import PageSpinner from '../components/PageSpinner';
import { type UserWithAbility } from '../hooks/user/useUser';
import { type useUserCompleteMutation } from '../hooks/user/useUserCompleteMutation';

export const JoinerSetup: FC<{
    user: UserWithAbility;
    completeMutation: ReturnType<typeof useUserCompleteMutation>;
}> = ({ user, completeMutation }) => {
    const hasCompletedRef = useRef(false);
    const { mutate: complete } = completeMutation;
    const { isMarketingOptedIn, isTrackingAnonymized } = user;

    useEffect(() => {
        if (hasCompletedRef.current) return;
        hasCompletedRef.current = true;
        complete({
            jobTitle: '',
            enableEmailDomainAccess: false,
            isMarketingOptedIn,
            isTrackingAnonymized,
        });
    }, [complete, isMarketingOptedIn, isTrackingAnonymized]);

    return <PageSpinner />;
};
