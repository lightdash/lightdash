import { type FC } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useHomepageBuilderFlag } from '../ee/features/homepageBuilder/hooks/useProjectHomepage';
import { useOrganization } from '../hooks/organization/useOrganization';
import useApp from '../providers/App/useApp';
import ErrorState from './common/ErrorState';
import PageSpinner from './PageSpinner';

const AppRoute: FC<React.PropsWithChildren> = ({ children }) => {
    const { health } = useApp();
    const location = useLocation();
    const orgRequest = useOrganization();
    const homepageBuilderFlag = useHomepageBuilderFlag();

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
        if (homepageBuilderFlag.isLoading) {
            return <PageSpinner />;
        }
        return (
            <Navigate
                to={{
                    pathname: homepageBuilderFlag.isEnabled
                        ? '/get-started'
                        : '/createProject',
                }}
                state={{ from: location }}
            />
        );
    }

    return <>{children}</>;
};

export default AppRoute;
