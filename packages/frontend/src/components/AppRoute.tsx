import { NonIdealState } from '@blueprintjs/core';
import React, { ComponentProps, FC } from 'react';
import { Redirect, Route } from 'react-router-dom';
import { useOrganisation } from '../hooks/organisation/useOrganisation';
import { useApp } from '../providers/AppProvider';
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
                        <div style={{ marginTop: '20px' }}>
                            <NonIdealState
                                title="Unexpected error"
                                description={orgRequest.error?.error.message}
                            />
                        </div>
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
