import { type FC } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useOrganization } from '../hooks/organization/useOrganization';
import useApp from '../providers/App/useApp';
import PageSpinner from './PageSpinner';
import ErrorState from './common/ErrorState';

const AppRoute: FC<React.PropsWithChildren> = ({ children }) => {
    const { health } = useApp();
    const location = useLocation();
    const orgRequest = useOrganization();

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

    if (orgRequest?.data?.needsProject) {
        return (
            <Navigate
                to={{
                    pathname: '/createProject',
                }}
                state={{ from: location }}
            />
        );
    }

    return <>{children}</>;
};

export default AppRoute;
