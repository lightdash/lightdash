import React, { useEffect, type ComponentProps, type FC } from 'react';
import { Route } from 'react-router-dom';
import { Navigate } from 'react-router-dom-v5-compat';
import { useEmailStatus } from '../hooks/useEmailVerification';
import useApp from '../providers/App/useApp';
import { useAbilityContext } from './common/Authorization/useAbilityContext';
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
                        <Navigate
                            to={{
                                pathname: '/login',
                            }}
                            state={{ from: location }}
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
                        <Navigate
                            to={{
                                pathname: '/verify-email',
                            }}
                            state={{ from: location }}
                        />
                    );
                }

                if (!data?.organizationUuid) {
                    return (
                        <Navigate
                            to={{
                                pathname: '/join-organization',
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

export default PrivateRoute;
