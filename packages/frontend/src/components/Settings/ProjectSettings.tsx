import { Stack } from '@mantine-8/core';
import { useMemo, type FC } from 'react';
import { Navigate, useParams, useRoutes, type RouteObject } from 'react-router';
import SettingsEmbed from '../../ee/features/embed/SettingsEmbed';
import { ProjectChangesets } from '../../features/changesets/components/ProjectChangesets';
import PullRequestsPage from '../../features/pullRequests/components/PullRequestsPage';
import RecentlyDeletedPage from '../../features/recentlyDeleted/components/RecentlyDeletedPage';
import { useProject } from '../../hooks/useProject';
import useApp from '../../providers/App/useApp';
import { DocumentTitle } from '../common/DocumentTitle';
import ErrorState from '../common/ErrorState';
import PageBreadcrumbs from '../common/PageBreadcrumbs';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import CompilationHistory from '../CompilationHistory';
import { DataOps } from '../DataOps';
import { DefaultUserSpaces } from '../DefaultUserSpaces';
import { useIsGitProject } from '../Explorer/WriteBackModal/hooks';
import PreAggregateAudit from '../PreAggregateAudit';
import PreAggregateMaterializations from '../PreAggregateMaterializations';
import ProjectUserAccess from '../ProjectAccess';
import ProjectAppearance from '../ProjectAppearance/ProjectAppearance';
import { UpdateProjectConnection } from '../ProjectConnection';
import ProjectParameters from '../ProjectParameters';
import ProjectPreviewExpiration from '../ProjectPreviewExpiration';
import ProjectTablesConfiguration from '../ProjectTablesConfiguration/ProjectTablesConfiguration';
import SettingsQueryTimezone from '../SettingsQueryTimezone';
import SettingsScheduler from '../SettingsScheduler';
import SettingsUsageAnalytics from '../SettingsUsageAnalytics';
import { SettingsValidator } from '../SettingsValidator';
import VerifiedContentPanel from '../VerifiedContent/VerifiedContentPanel';

const ProjectSettings: FC = () => {
    const { projectUuid } = useParams<{
        projectUuid: string;
    }>();

    const { health } = useApp();
    const { isInitialLoading, data: project, error } = useProject(projectUuid);

    const isSoftDeleteEnabled = health.data?.softDelete?.enabled ?? false;
    // Only relevant when the project's code lives in a Git provider, since the
    // section lists PRs opened against that repo.
    const isGitProject = useIsGitProject(projectUuid ?? '');

    const routes = useMemo<RouteObject[]>(() => {
        if (!projectUuid) {
            return [];
        }
        return [
            {
                path: `/settings`,
                element: <UpdateProjectConnection projectUuid={projectUuid} />,
            },
            {
                path: `/tablesConfiguration`,
                element: (
                    <ProjectTablesConfiguration projectUuid={projectUuid} />
                ),
            },
            {
                path: `/changesets`,
                element: <ProjectChangesets projectUuid={projectUuid} />,
            },
            {
                path: `/projectAccess`,
                element: <ProjectUserAccess projectUuid={projectUuid} />,
            },
            {
                path: `/appearance`,
                element: <ProjectAppearance projectUuid={projectUuid} />,
            },
            {
                path: `/usageAnalytics`,
                element: <SettingsUsageAnalytics projectUuid={projectUuid} />,
            },
            {
                path: `/scheduledDeliveries`,
                element: <SettingsScheduler projectUuid={projectUuid} />,
            },
            {
                path: `/validator`,
                element: <SettingsValidator projectUuid={projectUuid} />,
            },
            {
                path: `/verifiedContent`,
                element: <VerifiedContentPanel projectUuid={projectUuid} />,
            },
            {
                path: `/dataOps`,
                element: <DataOps projectUuid={projectUuid} />,
            },
            {
                path: `/defaultUserSpaces`,
                element: <DefaultUserSpaces projectUuid={projectUuid} />,
            },
            ...(isSoftDeleteEnabled
                ? [
                      {
                          path: `/recentlyDeleted`,
                          element: (
                              <RecentlyDeletedPage projectUuid={projectUuid} />
                          ),
                      },
                  ]
                : []),
            {
                path: `/parameters`,
                element: <ProjectParameters projectUuid={projectUuid} />,
            },
            {
                path: `/queryTimezone`,
                element: <SettingsQueryTimezone projectUuid={projectUuid} />,
            },
            {
                path: `/previewsConfig`,
                element: <ProjectPreviewExpiration projectUuid={projectUuid} />,
            },
            {
                path: `/compilationHistory`,
                element: <CompilationHistory projectUuid={projectUuid} />,
            },
            ...(isGitProject
                ? [
                      {
                          path: `/pullRequests`,
                          element: (
                              <PullRequestsPage projectUuid={projectUuid} />
                          ),
                      },
                  ]
                : []),
            {
                path: `/preAggregates`,
                children: [
                    {
                        index: true,
                        element: (
                            <Navigate
                                to={`/generalSettings/projectManagement/${projectUuid}/preAggregates/audit`}
                                replace
                            />
                        ),
                    },
                    {
                        path: `materializations`,
                        element: (
                            <PreAggregateMaterializations
                                projectUuid={projectUuid}
                            />
                        ),
                    },
                    {
                        path: `audit`,
                        element: (
                            <PreAggregateAudit projectUuid={projectUuid} />
                        ),
                    },
                ],
            },
            {
                path: '*',
                element: <Navigate to={`/generalSettings`} />,
            },
            {
                path: '/embed', // commercial route
                element: <SettingsEmbed projectUuid={projectUuid} />,
            },
        ];
    }, [projectUuid, isSoftDeleteEnabled, isGitProject]);
    const routesElements = useRoutes(routes);

    if (error) {
        return <ErrorState error={error.error} />;
    }

    if (isInitialLoading || !project || !projectUuid) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState title="Loading project" loading />
            </div>
        );
    }

    return (
        <>
            <DocumentTitle title="Project Settings" />

            <Stack gap="xl">
                <PageBreadcrumbs
                    items={[
                        {
                            title: 'All projects',
                            to: '/generalSettings/projectManagement',
                        },
                        {
                            title: project.name,
                            active: true,
                        },
                    ]}
                />
                {routesElements}
            </Stack>
        </>
    );
};

export default ProjectSettings;
