import React, { ComponentProps, FC, useEffect } from 'react';
import { Redirect, Route } from 'react-router-dom';
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

                if (isLoading) {
                    return <PageSpinner />;
                }

                return children;
            }}
        />
    );
};

export default PrivateRoute;
