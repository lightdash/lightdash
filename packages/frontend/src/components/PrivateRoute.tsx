import { getUserAbilityBuilder } from '@lightdash/common';
import React, { ComponentProps, FC, useContext, useEffect } from 'react';
import { Redirect, Route } from 'react-router-dom';
import { useApp } from '../providers/AppProvider';
import { AbilityContext } from './common/Authorization';
import PageSpinner from './PageSpinner';

const PrivateRoute: FC<ComponentProps<typeof Route>> = ({
    children,
    ...rest
}) => {
    const { health, user } = useApp();
    const ability = useContext(AbilityContext);

    useEffect(() => {
        if (user.data) {
            const builder = getUserAbilityBuilder(
                user.data,
                user.data.projectRoles,
            );
            ability.update(builder.rules);
        }
    }, [ability, user]);

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

                return children;
            }}
        />
    );
};

export default PrivateRoute;
