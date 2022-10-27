import { NonIdealState } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { ComponentProps, FC } from 'react';
import { Redirect, Route } from 'react-router-dom';
import { useOrganisation } from '../hooks/organisation/useOrganisation';
import { useApp } from '../providers/AppProvider';
import PageSpinner from './PageSpinner';

const AppRoute: FC<ComponentProps<typeof Route>> = ({ children, ...rest }) => {
    const {
        health: {
            data: health,
            isLoading: isLoadingHealth,
            error: healthError,
        },
        user: { data: user, isLoading: isLoadingUser, error: userError },
    } = useApp();
    const {
        data: organization,
        error: organizationError,
        isLoading: isLoadingOrganization,
    } = useOrganisation();

    if (isLoadingHealth || isLoadingUser || isLoadingOrganization) {
        return <PageSpinner />;
    }

    if (healthError || userError || organizationError) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState
                    title="Unexpected error"
                    description={
                        healthError?.error.message ||
                        userError?.error.message ||
                        organizationError?.error.message
                    }
                />
            </div>
        );
    }

    if (!health || !user || !organization) return null;

    const canUserCreateProject = user.ability.can(
        'create',
        subject('Project', {
            organizationUuid: organization.organizationUuid,
        }),
    );

    return (
        <Route
            {...rest}
            render={() => {
                if (organization.needsProject && canUserCreateProject) {
                    return <Redirect to="/createProject" />;
                } else if (organization.needsProject && !canUserCreateProject) {
                    return <Redirect to="/no-project-access" />;
                } else {
                    return children;
                }
            }}
        />
    );
};

export default AppRoute;
