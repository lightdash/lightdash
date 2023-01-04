import React, { ComponentProps, FC } from 'react';
import { Redirect, Route } from 'react-router-dom';
import { useOrganisation } from '../hooks/organisation/useOrganisation';
import { useApp } from '../providers/AppProvider';
import ErrorState from './common/ErrorState';
import PageSpinner from './PageSpinner';

const AppRoute: FC<ComponentProps<typeof Route>> = ({ children, ...rest }) => {
    const { health } = useApp();
    const orgRequest = useOrganisation();

    return (
        <Route
            {...rest}
            render={({ location }) => {
                if (health.isLoading || orgRequest.isLoading) {
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

                if (orgRequest.data?.needsProject) {
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
