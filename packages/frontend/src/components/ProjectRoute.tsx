import { NonIdealState } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import React, { ComponentProps, FC } from 'react';
import { Redirect, Route, useParams } from 'react-router-dom';
import { useProjects } from '../hooks/useProjects';
import { useApp } from '../providers/AppProvider';
import { Can } from './common/Authorization';
import PageSpinner from './PageSpinner';

const ProjectRoute: FC<ComponentProps<typeof Route>> = ({
    children,
    ...rest
}) => {
    const params = useParams<{ projectUuid: string | undefined }>();
    const { user } = useApp();
    const projectsRequest = useProjects();

    return (
        <Route
            {...rest}
            render={() => {
                if (projectsRequest.isLoading) {
                    return <PageSpinner />;
                }

                if (projectsRequest.error) {
                    return (
                        <div style={{ marginTop: '20px' }}>
                            <NonIdealState
                                title="Unexpected error"
                                description={
                                    projectsRequest.error.error.message
                                }
                            />
                        </div>
                    );
                }

                if (
                    !projectsRequest.data ||
                    projectsRequest.data?.length <= 0
                ) {
                    return <Redirect to={`/no-access`} />;
                }

                return (
                    <Can
                        I="view"
                        this={subject('Project', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid: params.projectUuid,
                        })}
                        passThrough
                    >
                        {(isAllowed) => {
                            return isAllowed ? (
                                children
                            ) : (
                                <Redirect to={`/no-project-access`} />
                            );
                        }}
                    </Can>
                );
            }}
        />
    );
};

export default ProjectRoute;
