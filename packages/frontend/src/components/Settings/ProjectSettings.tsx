import { subject } from '@casl/ability';
import { FeatureFlags } from '@lightdash/common';
import { Anchor, Stack, Text, Title } from '@mantine-8/core';
import { useMemo, type FC, type PropsWithChildren } from 'react';
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
import {
    SettingsPage,
    SettingsPageContainer,
} from '../common/Settings/SettingsPage';
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

type ProjectSettingsPageProps = PropsWithChildren<{
    title: string;
    description: string;
}>;

const ProjectSettingsPage: FC<ProjectSettingsPageProps> = ({
    title,
    description,
    children,
}) => (
    <SettingsPage title={title} description={description}>
        {children}
    </SettingsPage>
);

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
                element: (
                    <ProjectSettingsPage
                        title="Connection settings"
                        description="Manage this project's warehouse and dbt connections."
                    >
                        <UpdateProjectConnection projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            {
                path: `/tablesConfiguration`,
                element: (
                    <ProjectSettingsPage
                        title="Tables configuration"
                        description="Choose which dbt models are available in this project."
                    >
                        <ProjectTablesConfiguration projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            {
                path: `/projectAccess`,
                element: (
                    <ProjectSettingsPage
                        title="Project access"
                        description="Manage who can access this project and what they can do."
                    >
                        <ProjectUserAccess projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            {
                path: `/appearance`,
                element: (
                    <ProjectSettingsPage
                        title="Appearance"
                        description="Customize colors and chart styling for this project."
                    >
                        <ProjectAppearance projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            {
                path: `/usageAnalytics`,
                element: (
                    <ProjectSettingsPage
                        title="Usage analytics"
                        description="Review how people use this project's content."
                    >
                        <SettingsUsageAnalytics projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            {
                path: `/scheduledDeliveries`,
                element: (
                    <ProjectSettingsPage
                        title="Syncs & scheduled deliveries"
                        description="Configure delivery defaults and manage this project's schedules."
                    >
                        <SettingsScheduler projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            {
                path: `/validator`,
                element: (
                    <ProjectSettingsPage
                        title="Validator"
                        description="Find content errors and issues across this project."
                    >
                        <SettingsValidator projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            {
                path: `/verifiedContent`,
                element: (
                    <ProjectSettingsPage
                        title="Verified content"
                        description="Review verified charts and dashboards in this project."
                    >
                        <VerifiedContentPanel projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            {
                path: `/dataOps`,
                element: (
                    <ProjectSettingsPage
                        title="Data ops"
                        description="Configure workflows for promoting content between projects."
                    >
                        <DataOps projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            {
                path: `/defaultUserSpaces`,
                element: (
                    <ProjectSettingsPage
                        title="Default user spaces"
                        description="Choose whether project members receive a personal space automatically."
                    >
                        <DefaultUserSpaces projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            ...(isSoftDeleteEnabled
                ? [
                      {
                          path: `/recentlyDeleted`,
                          element: (
                              <ProjectSettingsPage
                                  title="Recently deleted"
                                  description="Review and restore recently deleted project content."
                              >
                                  <RecentlyDeletedPage
                                      projectUuid={projectUuid}
                                  />
                              </ProjectSettingsPage>
                          ),
                      },
                  ]
                : []),
            {
                path: `/parameters`,
                element: (
                    <ProjectSettingsPage
                        title="Parameters"
                        description="Review reusable values defined for project queries and content."
                    >
                        <ProjectParameters projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            {
                path: `/queryTimezone`,
                element: (
                    <ProjectSettingsPage
                        title="Project time zone"
                        description="Set the default time zone used by this project."
                    >
                        <SettingsQueryTimezone projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            {
                path: `/previewsConfig`,
                element: (
                    <ProjectSettingsPage
                        title="Preview settings"
                        description="Configure preview project expiration and cleanup."
                    >
                        <ProjectPreviewExpiration projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            {
                path: `/compilationHistory`,
                element: (
                    <ProjectSettingsPage
                        title="Compilation history"
                        description="Review recent dbt compilation runs for this project."
                    >
                        <CompilationHistory projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            ...(isPgWireEnabled
                ? [
                      {
                          path: `/semanticLayer`,
                          element: (
                              <ProjectSettingsPage
                                  title="Semantic layer"
                                  description="Configure this project's semantic layer connection."
                              >
                                  <SemanticLayerConnectionPanel
                                      projectUuid={projectUuid}
                                  />
                              </ProjectSettingsPage>
                          ),
                      },
                  ]
                : []),
            ...(isGitProject
                ? [
                      {
                          path: `/pullRequests`,
                          element: (
                              <ProjectSettingsPage
                                  title="Pull requests"
                                  description="Review pull requests opened for this project's code."
                              >
                                  <PullRequestsPage projectUuid={projectUuid} />
                              </ProjectSettingsPage>
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
                element: (
                    <ProjectSettingsPage
                        title="Embed configuration"
                        description="Configure embedded access for this project."
                    >
                        <SettingsEmbed projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            ...(user.data?.ability.can('manage', 'Organization')
                ? [
                      {
                          path: '/embed/cors',
                          element: (
                              <ProjectSettingsPage
                                  title="CORS"
                                  description="Control which external browser origins can call the Lightdash API."
                              >
                                  <SettingsGridCard>
                                      <Stack gap="xs">
                                          <Title order={5}>
                                              Allowed origins
                                          </Title>
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
                              </ProjectSettingsPage>
                          ),
                      },
                  ]
                : []),
            ...(canManageExternalConnections
                ? [
                      {
                          path: `/dataAppConnections`,
                          element: (
                              <ProjectSettingsPage
                                  title="Data app connections"
                                  description="Manage external connections used by this project's data apps."
                              >
                                  <DataAppConnectionsPanel
                                      projectUuid={projectUuid}
                                  />
                              </ProjectSettingsPage>
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
                <SettingsPageContainer>
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
                </SettingsPageContainer>
                {routesElements}
            </Stack>
        </>
    );
};

export default ProjectSettings;
