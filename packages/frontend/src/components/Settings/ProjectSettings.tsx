import { subject } from '@casl/ability';
import { FeatureFlags } from '@lightdash/common';
import { Anchor, Stack, Text, Title } from '@mantine-8/core';
import { useMemo, type FC } from 'react';
import {
    matchPath,
    Navigate,
    useLocation,
    useParams,
    useRoutes,
    type RouteObject,
} from 'react-router';
import SettingsEmbed from '../../ee/features/embed/SettingsEmbed';
import PullRequestsPage from '../../features/pullRequests/components/PullRequestsPage';
import RecentlyDeletedPage from '../../features/recentlyDeleted/components/RecentlyDeletedPage';
import { useOrganization } from '../../hooks/organization/useOrganization';
import { useProject } from '../../hooks/useProject';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import { DocumentTitle } from '../common/DocumentTitle';
import ErrorState from '../common/ErrorState';
import PageBreadcrumbs from '../common/PageBreadcrumbs';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
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
import CorsSettingsPanel from '../UserSettings/CorsSettingsPanel';
import VerifiedContentPanel from '../VerifiedContent/VerifiedContentPanel';
import DataAppConnectionsPanel from './DataAppConnectionsPanel';
import SemanticLayerConnectionPanel from './SemanticLayerConnectionPanel';

const ProjectSettings: FC = () => {
    const { projectUuid } = useParams<{
        projectUuid: string;
    }>();
    const location = useLocation();

    const { health, user } = useApp();
    const { isInitialLoading, data: project, error } = useProject(projectUuid);

    const { data: organization } = useOrganization();

    const isSoftDeleteEnabled = health.data?.softDelete?.enabled ?? false;
    const isPgWireEnabled = organization?.pgWire?.enabled ?? false;
    // Only relevant when the project's code lives in a Git provider, since the
    // section lists PRs opened against that repo.
    const isGitProject = useIsGitProject(projectUuid ?? '');

    const { data: dataAppsFlag, isLoading: isDataAppsFlagLoading } =
        useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const isDataAppsEnabled = dataAppsFlag?.enabled ?? false;
    const canManageExternalConnections =
        isDataAppsEnabled &&
        !!project &&
        (user.data?.ability.can(
            'manage',
            subject('ExternalConnection', {
                organizationUuid: project.organizationUuid,
                projectUuid: project.projectUuid,
            }),
        ) ??
            false);

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
            ...(isPgWireEnabled
                ? [
                      {
                          path: `/semanticLayer`,
                          element: (
                              <SemanticLayerConnectionPanel
                                  projectUuid={projectUuid}
                              />
                          ),
                      },
                  ]
                : []),
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
            ...(user.data?.ability.can('manage', 'Organization')
                ? [
                      {
                          path: '/embed/cors',
                          element: (
                              <Stack gap="xl">
                                  <SettingsGridCard>
                                      <Stack gap="xs">
                                          <Title order={4}>CORS</Title>
                                          <Text c="ldGray.6" fz="xs">
                                              CORS controls which external
                                              browser origins can call the
                                              Lightdash API. Add exact origins
                                              like https://app.example.com or
                                              wildcard subdomains like
                                              *.example.com. Use regex only for
                                              advanced patterns.
                                          </Text>
                                          <Text c="ldGray.6" fz="xs">
                                              This is commonly needed for
                                              embedding Lightdash in another
                                              application.{' '}
                                              <Anchor
                                                  inherit
                                                  href="https://docs.lightdash.com/guides/embedding/how-to-embed-content#cors"
                                                  target="_blank"
                                                  rel="noreferrer"
                                              >
                                                  Read the embedding docs
                                              </Anchor>
                                              .
                                          </Text>
                                      </Stack>
                                      <CorsSettingsPanel />
                                  </SettingsGridCard>
                              </Stack>
                          ),
                      },
                  ]
                : []),
            ...(canManageExternalConnections
                ? [
                      {
                          path: `/dataAppConnections`,
                          element: (
                              <DataAppConnectionsPanel
                                  projectUuid={projectUuid}
                              />
                          ),
                      },
                  ]
                : []),
        ];
    }, [
        projectUuid,
        isSoftDeleteEnabled,
        isPgWireEnabled,
        isGitProject,
        user.data?.ability,
        canManageExternalConnections,
    ]);
    const routesElements = useRoutes(routes);

    if (error) {
        return <ErrorState error={error.error} />;
    }

    // The dataAppConnections route only registers once the flag resolves. On a
    // hard load (e.g. the builder's "New connection" deep link opening in a new
    // tab) the flag is still pending, so without this wait the nested catch-all
    // below bounces to the settings index before the route exists.
    const isAwaitingDataAppConnectionsRoute =
        isDataAppsFlagLoading &&
        !!matchPath(
            '/generalSettings/projectManagement/:projectUuid/dataAppConnections',
            location.pathname,
        );

    if (
        isInitialLoading ||
        !project ||
        !projectUuid ||
        isAwaitingDataAppConnectionsRoute
    ) {
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
