import React, { ComponentProps, FC, useEffect } from 'react';
import { Redirect, Route } from 'react-router-dom';
import { useEmailStatus } from '../hooks/useEmailVerification';
import { useApp } from '../providers/AppProvider';
import { useAbilityContext } from './common/Authorization';
import PageSpinner from './PageSpinner';

const PrivateRoute: FC<
    React.PropsWithChildren<ComponentProps<typeof Route>>
> = ({ children, ...rest }) => {
    const {
        health,
        user: { data, isInitialLoading },
    } = useApp();
    const ability = useAbilityContext();
    const emailStatus = useEmailStatus(!!health.data?.isAuthenticated);
    const isEmailServerConfigured = health.data?.hasEmailClient;

    useEffect(() => {
        if (data) {
            ability.update(data.abilityRules);
        }
    }, [ability, data]);

    return (
        <Route
            {...rest}
            render={({ location }) => {
                if (health.isInitialLoading || health.error) {
                    return <PageSpinner />;
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

                if (isInitialLoading || emailStatus.isInitialLoading) {
                    return <PageSpinner />;
                }

                if (
                    !emailStatus.data?.isVerified &&
                    isEmailServerConfigured &&
                    !data?.isSetupComplete
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

                if (!data?.organizationUuid) {
                    return (
                        <Redirect
                            to={{
                                pathname: '/join-organization',
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
