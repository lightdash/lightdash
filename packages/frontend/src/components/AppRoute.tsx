import { type ComponentProps, type FC } from 'react';
import { Route } from 'react-router-dom';
import { Navigate } from 'react-router-dom-v5-compat';
import { useOrganization } from '../hooks/organization/useOrganization';
import useApp from '../providers/App/useApp';
import ErrorState from './common/ErrorState';
import PageSpinner from './PageSpinner';

const AppRoute: FC<React.PropsWithChildren<ComponentProps<typeof Route>>> = ({
    children,
    ...rest
}) => {
    const { health } = useApp();

    const orgRequest = useOrganization();

    return (
        <Route
            {...rest}
            render={({ location }) => {
                if (health.isInitialLoading || orgRequest.isInitialLoading) {
                    return <PageSpinner />;
                }

                if (orgRequest.error || health.error) {
                    return (
                        <ErrorState
                            error={
                                orgRequest.error?.error || health.error?.error
                            }
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

                return children;
            }}
        />
    );
};

export default AppRoute;
