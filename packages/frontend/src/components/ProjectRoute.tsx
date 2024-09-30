import { subject } from '@casl/ability';
import React, { type ComponentProps, type FC } from 'react';
import { Redirect, Route } from 'react-router-dom';
import ErrorState from '../components/common/ErrorState';
import { useProjects } from '../hooks/useProjects';
import { useApp } from '../providers/AppProvider';
import { Can } from './common/Authorization';
import PageSpinner from './PageSpinner';

const ProjectRoute: FC<
    React.PropsWithChildren<ComponentProps<typeof Route>>
> = ({ children, ...rest }) => {
    const { user } = useApp();
    const { data: projects, isInitialLoading, isError, error } = useProjects();

    return (
        <Route
            {...rest}
            render={(location) => {
                if (isInitialLoading) {
                    return <PageSpinner />;
                }

                if (isError && error) {
                    return <ErrorState error={error.error} />;
                }

                if (!projects || projects.length <= 0) {
                    return <Redirect to="/no-access" />;
                }

                return (
                    <Can
                        I="view"
                        this={subject('Project', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid: location.match.params.projectUuid,
                        })}
                        passThrough
                    >
                        {(isAllowed) => {
                            return isAllowed ? (
                                children
                            ) : (
                                <Redirect to="/no-project-access" />
                            );
                        }}
                    </Can>
                );
            }}
        />
    );
};

export default ProjectRoute;
