import { ComponentProps, FC } from 'react';
import { Redirect, Route } from 'react-router-dom';
import { useOrganization } from '../hooks/organization/useOrganization';
import { useApp } from '../providers/AppProvider';
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
                        <Redirect
                            to={{
                                pathname: '/createProject',
                                state: { from: location },
                            }}
                        />
                    );
                }

                return children;
            }}
        />
    );
};

export default AppRoute;
