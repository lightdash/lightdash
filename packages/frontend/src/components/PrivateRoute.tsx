import { Route, Redirect } from 'react-router-dom';
import React, { ComponentProps, FC } from 'react';
import { useApp } from '../providers/AppProvider';
import PageSpinner from './PageSpinner';

const PrivateRoute: FC<ComponentProps<typeof Route>> = ({
    children,
    ...rest
}) => {
    const { health } = useApp();

    return (
        <Route
            {...rest}
            render={({ location }) => {
                if (health.isLoading || health.error) {
                    return <PageSpinner />;
                }

                if (health.data?.needsSetup || health.data?.needsProject) {
                    return (
                        <Redirect
                            to={{
                                pathname: '/welcome',
                                state: { from: location },
                            }}
                        />
                    );
                }

                if (!health.data?.isAuthenticated) {
                    return (
                        <Redirect
                            to={{
                                pathname: '/login',
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

export default PrivateRoute;
