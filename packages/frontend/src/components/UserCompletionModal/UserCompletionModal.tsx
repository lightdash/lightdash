import { useIsMutating } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import useApp from '../../providers/App/useApp';

const UserCompletionModalWithUser = () => {
    const { user, health } = useApp();
    const location = useLocation();
    const isCompletingUser =
        useIsMutating({ mutationKey: ['user_complete'] }) > 0;
    const [hasCompletedSetup, setHasCompletedSetup] = useState(
        user.data?.isSetupComplete === true,
    );

    if (user.data?.isSetupComplete && !hasCompletedSetup) {
        setHasCompletedSetup(true);
    }

    const shouldSetup =
        user.data &&
        !user.data.isSetupComplete &&
        health.isSuccess &&
        !isCompletingUser &&
        !hasCompletedSetup;
    return shouldSetup ? (
        <Navigate
            to={
                location.pathname && location.pathname !== '/'
                    ? `/organization-setup?redirect=${encodeURIComponent(
                          location.pathname,
                      )}`
                    : '/organization-setup'
            }
        />
    ) : null;
};

export default UserCompletionModalWithUser;
