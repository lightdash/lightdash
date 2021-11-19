import React, { ComponentProps, FC } from 'react';
import { Redirect, Route } from 'react-router-dom';
import { useApp } from '../providers/AppProvider';
import PageSpinner from './PageSpinner';

const AppRoute: FC<ComponentProps<typeof Route>> = ({ children, ...rest }) => {
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

export default AppRoute;
