import { subject } from '@casl/ability';
import React, { type FC } from 'react';
import { Navigate, useParams } from 'react-router';
import { validate as isUuidString } from 'uuid';
import ErrorState from '../components/common/ErrorState';
import { useActiveProjectUuid } from '../hooks/useActiveProject';
import { useProject } from '../hooks/useProject';
import {
    ProjectRouteContext,
    type ProjectRouteContextValue,
} from '../hooks/useProjectRoute';
import { useProjects } from '../hooks/useProjects';
import { Can } from '../providers/Ability';
import useApp from '../providers/App/useApp';
import { getProjectUrlIdentifier } from '../utils/projectUrl';
import PageSpinner from './PageSpinner';

const ResolvedProjectRoute: FC<
    React.PropsWithChildren<{ projectUuid: string }>
> = ({ children, projectUuid }) => {
    const { user } = useApp();
    const { isLoading: isInitialLoading } = useActiveProjectUuid({
        refetchOnMount: true,
        projectUuid,
    });

    const { data: project, isError, error } = useProject(projectUuid);
    if (isInitialLoading) {
        return <PageSpinner />;
    }

    if (isError && error) {
        return <ErrorState error={error.error} />;
    }

    if (!project) {
        return <Navigate to="/no-access" />;
    }

    const projectRouteContext: ProjectRouteContextValue = {
        project,
        projectUuid,
        projectUrlIdentifier: getProjectUrlIdentifier(project),
    };

    return (
        <Can
            I="view"
            this={subject('Project', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid: projectUuid,
            })}
            passThrough
        >
            {(isAllowed) => {
                return isAllowed ? (
                    <ProjectRouteContext.Provider value={projectRouteContext}>
                        {children}
                    </ProjectRouteContext.Provider>
                ) : (
                    <Navigate to="/no-project-access" />
                );
            }}
        </Can>
    );
};

const ProjectRoute: FC<React.PropsWithChildren> = ({ children }) => {
    const { projectUuid: projectIdentifier } = useParams();
    const isProjectUuid = isUuidString(projectIdentifier ?? '');
    const projectsQuery = useProjects({
        enabled: !!projectIdentifier && !isProjectUuid,
    });

    if (!projectIdentifier) {
        return <Navigate to="/projects" replace />;
    }

    if (!isProjectUuid && projectsQuery.isInitialLoading) {
        return <PageSpinner />;
    }

    if (!isProjectUuid && projectsQuery.isError) {
        return <ErrorState error={projectsQuery.error.error} />;
    }

    const projectUuid = isProjectUuid
        ? projectIdentifier
        : projectsQuery.data?.find(
              (project) => project.slug === projectIdentifier,
          )?.projectUuid;

    if (!projectUuid) {
        return <Navigate to="/projects" replace />;
    }

    return (
        <ResolvedProjectRoute projectUuid={projectUuid}>
            {children}
        </ResolvedProjectRoute>
    );
};

export default ProjectRoute;
