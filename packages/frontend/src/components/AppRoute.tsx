import { NonIdealState } from '@blueprintjs/core';
import React, { ComponentProps, FC } from 'react';
import { Redirect, Route } from 'react-router-dom';
import { useOrganisation } from '../hooks/organisation/useOrganisation';
import { useProjects } from '../hooks/useProjects';
import { useApp } from '../providers/AppProvider';
import PageSpinner from './PageSpinner';

const AppRoute: FC<ComponentProps<typeof Route>> = ({ children, ...rest }) => {
    const { health } = useApp();
    const orgRequest = useOrganisation();
    const projectsRequest = useProjects();

    return (
        <Route
            {...rest}
            render={({ location }) => {
                if (
                    health.isLoading ||
                    orgRequest.isLoading ||
                    projectsRequest.isLoading
                ) {
                    return <PageSpinner />;
                }

                if (orgRequest.error || projectsRequest.error || health.error) {
                    return (
                        <div style={{ marginTop: '20px' }}>
                            <NonIdealState
                                title="Unexpected error"
                                description={
                                    (orgRequest.error || projectsRequest.error)
                                        ?.error.message
                                }
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

                if (
                    !projectsRequest.data ||
                    projectsRequest.data?.length <= 0
                ) {
                    return <Redirect to={`/no-access`} />;
                }

                return children;
            }}
        />
    );
};

export default AppRoute;
