import { LightdashMode } from '@lightdash/common';
import React, { ComponentProps, FC, useEffect } from 'react';
import { Redirect, Route } from 'react-router-dom';
import { useEmailStatus } from '../hooks/useEmailVerification';
import { useApp } from '../providers/AppProvider';
import { useAbilityContext } from './common/Authorization';
import PageSpinner from './PageSpinner';

const PrivateRoute: FC<ComponentProps<typeof Route>> = ({
    children,
    ...rest
}) => {
    const {
        health,
        user: { data, isLoading },
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
                if (health.isLoading || health.error) {
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

                if (isLoading || emailStatus.isLoading) {
                    return <PageSpinner />;
                }

                if (
                    health.data?.mode !== LightdashMode.PR &&
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
