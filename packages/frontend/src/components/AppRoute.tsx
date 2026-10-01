import { type Organization } from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FC } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useOrganization } from '../hooks/organization/useOrganization';
import { useNoProjectLanding } from '../hooks/useNoProjectLanding';
import useApp from '../providers/App/useApp';
import ErrorState from './common/ErrorState';
import PageSpinner from './PageSpinner';

const AppRoute: FC<React.PropsWithChildren> = ({ children }) => {
    const { health } = useApp();
    const location = useLocation();
    const queryClient = useQueryClient();

    const [mustConfirmNoProject] = useState(
        () =>
            queryClient.getQueryData<Organization>(['organization'])
                ?.needsProject === true,
    );

    const orgRequest = useOrganization(
        mustConfirmNoProject ? { refetchOnMount: 'always' } : undefined,
    );
    const noProjectLanding = useNoProjectLanding();

    if (health.isInitialLoading || orgRequest.isInitialLoading) {
        return <PageSpinner />;
    }

    if (orgRequest.error || health.error) {
        return (
            <ErrorState
                error={orgRequest.error?.error || health.error?.error}
            />
        );
    }

    if (orgRequest.data?.needsProject) {
        if (noProjectLanding.isLoading) {
            return <PageSpinner />;
        }
        if (noProjectLanding.pathname) {
            return (
                <Navigate
                    to={{ pathname: noProjectLanding.pathname }}
                    state={{ from: location }}
                />
            );
        }
    }

    return <>{children}</>;
};

export default AppRoute;
