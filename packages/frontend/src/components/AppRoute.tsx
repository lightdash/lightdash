import React, { ComponentProps, FC } from 'react';
import { Redirect, Route } from 'react-router-dom';
import { useOrganisation } from '../hooks/organisation/useOrganisation';
import { useEmailStatus } from '../hooks/useEmailVerification';
import { useApp } from '../providers/AppProvider';
import ErrorState from './common/ErrorState';
import PageSpinner from './PageSpinner';

const AppRoute: FC<ComponentProps<typeof Route>> = ({ children, ...rest }) => {
    const { health, user } = useApp();
    const { data } = useEmailStatus();
    const isEmailServerConfigured = health.data?.hasEmailClient;
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

                if (
                    !data?.isVerified &&
                    isEmailServerConfigured &&
                    !user.data?.isSetupComplete
                ) {
                    return (
                        <Redirect
                            to={{
                                pathname: '/verify-email',
                                state: { from: location },
                            }}
                        />
                    );
                }

                if (data?.isVerified && orgRequest?.data?.needsProject) {
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
