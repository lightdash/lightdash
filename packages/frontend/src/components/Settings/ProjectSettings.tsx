import { subject } from '@casl/ability';
import { FeatureFlags } from '@lightdash/common';
import { Stack, Text, Title } from '@mantine/core';
import * as Sentry from '@sentry/react';
import {
    useMemo,
    type FC,
    type PropsWithChildren,
    type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
    matchPath,
    Navigate,
    useLocation,
    useRoutes,
    type RouteObject,
} from 'react-router';
import { ProjectAiRegionPanel } from '../../ee/features/aiCopilot/components/Admin/settings/ProjectAiRegionPanel';
import { useAiOrganizationSettings } from '../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';
import { ContentReviewSettingsPanel } from '../../ee/features/contentReview';
import { useContentReviewAvailability } from '../../ee/features/contentReview/hooks/useContentReviewAvailability';
import SettingsEmbed from '../../ee/features/embed/SettingsEmbed';
import { ProjectAgentIdentityPage } from '../../features/aiAccess/ProjectAgentIdentityPage';
import ContentReviewPage from '../../features/contentAsCode/components/ContentReviewPage';
import { ExternalSourcesSettingsPanel } from '../../features/externalSources/components/ExternalSourcesSettingsPanel';
import PullRequestsPage from '../../features/pullRequests/components/PullRequestsPage';
import RecentlyDeletedPage from '../../features/recentlyDeleted/components/RecentlyDeletedPage';
import ScopeTourHost from '../../features/scopeTours/ScopeTourHost';
import { useIsTrainingCopy } from '../../features/scopeTours/useIsTrainingCopy';
import { useOrganization } from '../../hooks/organization/useOrganization';
import {
    type LimitedProjectSettingsPage,
    type ProjectSettingsAccess,
} from '../../hooks/settings/projectSettingsAccess';
import { useProject } from '../../hooks/useProject';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import Callout from '../common/Callout';
import { DocumentTitle } from '../common/DocumentTitle';
import ErrorState from '../common/ErrorState';
import PageBreadcrumbs from '../common/PageBreadcrumbs';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
import {
    SettingsPage,
    SettingsPageContainer,
    SettingsPageDocumentationLink,
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
import ProjectResultsCache from '../ProjectResultsCache';
import ProjectTablesConfiguration from '../ProjectTablesConfiguration/ProjectTablesConfiguration';
import SettingsAgentDataScope from '../SettingsAgentDataScope';
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
    actions?: ReactNode;
}>;

const ProjectSettingsPage: FC<ProjectSettingsPageProps> = ({
    title,
    description,
    actions,
    children,
}) => (
    <SettingsPage title={title} description={description} actions={actions}>
        {children}
    </SettingsPage>
);

const ProjectSettings: FC<{
    externalSourcesEnabled: boolean;
    projectSettingsAccess: Exclude<ProjectSettingsAccess, { type: 'none' }>;
}> = ({ externalSourcesEnabled, projectSettingsAccess }) => {
    const { t } = useTranslation('settings');
    const projectUuid = useProjectUuid();
    const location = useLocation();

    const { health, user } = useApp();
    const { isInitialLoading, data: project, error } = useProject(projectUuid);
    // A learner copy has no project list to go back to.
    const { isTrainingCopy } = useIsTrainingCopy(project);

    const { data: organization } = useOrganization();

    const isSoftDeleteEnabled = health.data?.softDelete?.enabled ?? false;
    const aiOrganizationSettingsQuery = useAiOrganizationSettings();
    // Must match the backend: the credential list and the project selection
    // both require manage:OrganizationAiAgent, not update:Project.
    const canManageOrgAiAgent =
        user.data?.ability?.can(
            'manage',
            subject('OrganizationAiAgent', {
                organizationUuid: user.data?.organizationUuid,
            }),
        ) ?? false;
    const isAiCopilotEnabledOrTrial =
        aiOrganizationSettingsQuery.isSuccess &&
        (aiOrganizationSettingsQuery.data.isCopilotEnabled ||
            aiOrganizationSettingsQuery.data.isTrial);
    const isPgWireEnabled = organization?.pgWire?.enabled ?? false;
    // Only relevant when the project's code lives in a Git provider, since the
    // section lists PRs opened against that repo.
    const isGitProject = useIsGitProject(projectUuid ?? '');

    const { data: dataAppsFlag, isLoading: isDataAppsFlagLoading } =
        useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const { data: resultsCacheFlag, isLoading: isResultsCacheFlagLoading } =
        useServerFeatureFlag(FeatureFlags.ResultsCacheEnabled);
    const { data: agentIdentityFlag, isLoading: isAgentIdentityFlagLoading } =
        useServerFeatureFlag(FeatureFlags.AgentIdentity);
    const canManageAgentIdentity =
        agentIdentityFlag?.enabled === true &&
        !!project &&
        (user.data?.ability.can(
            'manage',
            subject('Project', {
                organizationUuid: project.organizationUuid,
                projectUuid: project.projectUuid,
            }),
        ) ??
            false);
    const isResultsCacheEnabled = resultsCacheFlag?.enabled ?? false;
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

    const canManageExternalSources =
        externalSourcesEnabled &&
        !!project &&
        (user.data?.ability.can(
            'manage',
            subject('ExternalSource', {
                organizationUuid: project.organizationUuid,
                projectUuid: project.projectUuid,
            }),
        ) ??
            false);

    const contentReviewAvailability = useContentReviewAvailability();
    const canViewContentReviewSettings =
        contentReviewAvailability.isAvailable &&
        !!project &&
        (user.data?.ability.can(
            'manage',
            subject('Project', {
                organizationUuid: project.organizationUuid,
                projectUuid: project.projectUuid,
            }),
        ) ??
            false);

    const routes = useMemo<RouteObject[]>(() => {
        if (!projectUuid) {
            return [];
        }
        const limitedRoutes: Record<LimitedProjectSettingsPage, RouteObject> = {
            validator: {
                path: '/validator',
                element: <SettingsValidator projectUuid={projectUuid} />,
            },
            recentlyDeleted: {
                path: '/recentlyDeleted',
                element: (
                    <ProjectSettingsPage
                        title={t('projectSettings.pages.recentlyDeleted.title')}
                        description={t(
                            'projectSettings.pages.recentlyDeleted.description',
                        )}
                    >
                        <RecentlyDeletedPage projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
        };
        if (projectSettingsAccess.type === 'limited') {
            return [
                ...projectSettingsAccess.pages.map(
                    (page) => limitedRoutes[page],
                ),
                {
                    path: '*',
                    element: (
                        <Navigate
                            to={`/generalSettings/projectManagement/${projectUuid}/${projectSettingsAccess.defaultPage}`}
                            replace
                        />
                    ),
                },
            ];
        }
        return [
            {
                path: `/settings`,
                element: (
                    <ProjectSettingsPage
                        title={t('projectSettings.pages.connection.title')}
                        description={t(
                            'projectSettings.pages.connection.description',
                        )}
                    >
                        <UpdateProjectConnection projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            {
                path: `/tablesConfiguration`,
                element: (
                    <ProjectSettingsPage
                        title={t(
                            'projectSettings.pages.tablesConfiguration.title',
                        )}
                        description={t(
                            'projectSettings.pages.tablesConfiguration.description',
                        )}
                    >
                        <ProjectTablesConfiguration projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            ...(canManageAgentIdentity && project
                ? [
                      {
                          path: '/agentIdentity',
                          element: (
                              <ProjectSettingsPage
                                  title={t(
                                      'projectSettings.pages.agentIdentity.title',
                                  )}
                                  description={t(
                                      'projectSettings.pages.agentIdentity.description',
                                  )}
                              >
                                  <ProjectAgentIdentityPage
                                      key={project.projectUuid}
                                      project={project}
                                  />
                              </ProjectSettingsPage>
                          ),
                      },
                  ]
                : []),
            {
                path: `/projectAccess`,
                element: (
                    <ProjectSettingsPage
                        title={t('projectSettings.pages.projectAccess.title')}
                        description={t(
                            'projectSettings.pages.projectAccess.description',
                        )}
                        actions={
                            <SettingsPageDocumentationLink
                                href="https://docs.lightdash.com/references/roles"
                                label={t('projectSettings.rolesDocumentation')}
                            />
                        }
                    >
                        <ProjectUserAccess projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            {
                path: `/appearance`,
                element: (
                    <ProjectSettingsPage
                        title={t('projectSettings.pages.appearance.title')}
                        description={t(
                            'projectSettings.pages.appearance.description',
                        )}
                    >
                        <ProjectAppearance projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            ...(canManageExternalSources
                ? [
                      {
                          path: `/externalSources`,
                          element: (
                              <ProjectSettingsPage
                                  title={t(
                                      'projectSettings.pages.externalSources.title',
                                  )}
                                  description={t(
                                      'projectSettings.pages.externalSources.description',
                                  )}
                              >
                                  <ExternalSourcesSettingsPanel
                                      projectUuid={projectUuid}
                                  />
                              </ProjectSettingsPage>
                          ),
                      },
                  ]
                : []),
            {
                path: `/usageAnalytics`,
                element: (
                    <ProjectSettingsPage
                        title={t('projectSettings.pages.usageAnalytics.title')}
                        description={t(
                            'projectSettings.pages.usageAnalytics.description',
                        )}
                    >
                        <SettingsUsageAnalytics projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            {
                path: `/scheduledDeliveries`,
                element: (
                    <ProjectSettingsPage
                        title={t(
                            'projectSettings.pages.scheduledDeliveries.title',
                        )}
                        description={t(
                            'projectSettings.pages.scheduledDeliveries.description',
                        )}
                    >
                        <SettingsScheduler projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            limitedRoutes.validator,
            {
                path: `/verifiedContent`,
                element: (
                    <ProjectSettingsPage
                        title={t('projectSettings.pages.verifiedContent.title')}
                        description={t(
                            'projectSettings.pages.verifiedContent.description',
                        )}
                    >
                        <VerifiedContentPanel projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            ...(canViewContentReviewSettings
                ? [
                      {
                          path: `/reviewRequests`,
                          element: (
                              <ProjectSettingsPage
                                  title={t(
                                      'projectSettings.pages.reviewRequests.title',
                                  )}
                                  description={t(
                                      'projectSettings.pages.reviewRequests.description',
                                  )}
                              >
                                  <ContentReviewSettingsPanel
                                      projectUuid={projectUuid}
                                  />
                              </ProjectSettingsPage>
                          ),
                      },
                  ]
                : []),
            {
                path: `/dataOps`,
                element: (
                    <ProjectSettingsPage
                        title={t('projectSettings.pages.dataOps.title')}
                        description={t(
                            'projectSettings.pages.dataOps.description',
                        )}
                    >
                        <DataOps projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            {
                path: `/defaultUserSpaces`,
                element: (
                    <ProjectSettingsPage
                        title={t(
                            'projectSettings.pages.defaultUserSpaces.title',
                        )}
                        description={t(
                            'projectSettings.pages.defaultUserSpaces.description',
                        )}
                    >
                        <DefaultUserSpaces projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            ...(isSoftDeleteEnabled ? [limitedRoutes.recentlyDeleted] : []),
            {
                path: `/parameters`,
                element: (
                    <ProjectSettingsPage
                        title={t('projectSettings.pages.parameters.title')}
                        description={t(
                            'projectSettings.pages.parameters.description',
                        )}
                        actions={
                            <SettingsPageDocumentationLink href="https://docs.lightdash.com/guides/using-parameters#how-to-use-parameters" />
                        }
                    >
                        <ProjectParameters projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            // Only registered when the instance has AI agents at all — same
            // gate as the AI agents navigation section.
            ...(isAiCopilotEnabledOrTrial
                ? [
                      {
                          path: `/agentDataScope`,
                          element: (
                              <ProjectSettingsPage
                                  title={t(
                                      'projectSettings.pages.agentDataScope.title',
                                  )}
                                  description={t(
                                      'projectSettings.pages.agentDataScope.description',
                                  )}
                              >
                                  <SettingsAgentDataScope
                                      projectUuid={projectUuid}
                                  />
                              </ProjectSettingsPage>
                          ),
                      },
                  ]
                : []),
            ...(isAiCopilotEnabledOrTrial && canManageOrgAiAgent
                ? [
                      {
                          path: `/aiRegion`,
                          element: (
                              <ProjectSettingsPage
                                  title={t(
                                      'projectSettings.pages.aiRegion.title',
                                  )}
                                  description={t(
                                      'projectSettings.pages.aiRegion.description',
                                  )}
                              >
                                  <ProjectAiRegionPanel
                                      projectUuid={projectUuid}
                                  />
                              </ProjectSettingsPage>
                          ),
                      },
                  ]
                : []),
            {
                path: `/queryTimezone`,
                element: (
                    <ProjectSettingsPage
                        title={t('projectSettings.pages.queryTimezone.title')}
                        description={t(
                            'projectSettings.pages.queryTimezone.description',
                        )}
                        actions={
                            <SettingsPageDocumentationLink href="https://docs.lightdash.com/guides/developer/timezones" />
                        }
                    >
                        <SettingsQueryTimezone projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
            },
            {
                path: `/previewsConfig`,
                element: (
                    <ProjectSettingsPage
                        title={t('projectSettings.pages.previewsConfig.title')}
                        description={t(
                            'projectSettings.pages.previewsConfig.description',
                        )}
                    >
                        <ProjectPreviewExpiration projectUuid={projectUuid} />
                    </ProjectSettingsPage>
                ),
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
                              <ProjectSettingsPage
                                  title={t(
                                      'projectSettings.pages.semanticLayer.title',
                                  )}
                                  description={t(
                                      'projectSettings.pages.semanticLayer.description',
                                  )}
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
                                  title={t(
                                      'projectSettings.pages.pullRequests.title',
                                  )}
                                  description={t(
                                      'projectSettings.pages.pullRequests.description',
                                  )}
                              >
                                  <PullRequestsPage projectUuid={projectUuid} />
                              </ProjectSettingsPage>
                          ),
                      },
                  ]
                : []),
            ...(isGitProject
                ? [
                      {
                          path: `/contentReview`,
                          element: (
                              <ProjectSettingsPage
                                  title={t(
                                      'projectSettings.pages.contentReview.title',
                                  )}
                                  description={t(
                                      'projectSettings.pages.contentReview.description',
                                  )}
                              >
                                  <ContentReviewPage
                                      projectUuid={projectUuid}
                                  />
                              </ProjectSettingsPage>
                          ),
                      },
                  ]
                : []),
            ...(isResultsCacheEnabled
                ? [
                      {
                          path: `/caching`,
                          element: (
                              <ProjectSettingsPage
                                  title={t(
                                      'projectSettings.pages.caching.title',
                                  )}
                                  description={t(
                                      'projectSettings.pages.caching.description',
                                  )}
                              >
                                  <ProjectResultsCache
                                      projectUuid={projectUuid}
                                  />
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
                        title={t('projectSettings.pages.embed.title')}
                        description={t(
                            'projectSettings.pages.embed.description',
                        )}
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
                                  title={t('projectSettings.pages.cors.title')}
                                  description={t(
                                      'projectSettings.pages.cors.description',
                                  )}
                                  actions={
                                      <SettingsPageDocumentationLink
                                          href="https://docs.lightdash.com/guides/embedding/how-to-embed-content#cors"
                                          label={t(
                                              'projectSettings.embeddingDocumentation',
                                          )}
                                      />
                                  }
                              >
                                  <SettingsGridCard>
                                      <Stack gap="xs">
                                          <Title order={5}>
                                              {t(
                                                  'projectSettings.cors.allowedOrigins',
                                              )}
                                          </Title>
                                          <Text c="dimmed" fz="xs">
                                              {t('projectSettings.cors.help')}
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
        projectSettingsAccess,
        isSoftDeleteEnabled,
        isPgWireEnabled,
        isGitProject,
        isResultsCacheEnabled,
        user.data?.ability,
        canManageExternalConnections,
        canManageAgentIdentity,
        project,
        canManageExternalSources,
        canViewContentReviewSettings,
        isAiCopilotEnabledOrTrial,
        canManageOrgAiAgent,
        t,
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
    const isAwaitingAgentIdentityRoute =
        isAgentIdentityFlagLoading &&
        !!matchPath(
            '/generalSettings/projectManagement/:projectUuid/agentIdentity',
            location.pathname,
        );
    const isAwaitingCachingRoute =
        isResultsCacheFlagLoading &&
        !!matchPath(
            '/generalSettings/projectManagement/:projectUuid/caching',
            location.pathname,
        );
    const isAwaitingReviewRequestsRoute =
        contentReviewAvailability.isLoading &&
        !!matchPath(
            '/generalSettings/projectManagement/:projectUuid/reviewRequests',
            location.pathname,
        );

    if (
        isInitialLoading ||
        !project ||
        !projectUuid ||
        isAwaitingDataAppConnectionsRoute ||
        isAwaitingCachingRoute ||
        isAwaitingAgentIdentityRoute ||
        isAwaitingReviewRequestsRoute
    ) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    title={t('projectSettings.loadingProject')}
                    loading
                />
            </div>
        );
    }

    return (
        <>
            <DocumentTitle title={t('projectSettings.documentTitle')} />

            {/* A walkthrough that clicked into project settings continues here. */}
            <Sentry.ErrorBoundary fallback={<></>}>
                <ScopeTourHost />
            </Sentry.ErrorBoundary>

            <Stack gap="xl">
                <SettingsPageContainer>
                    <PageBreadcrumbs
                        items={[
                            ...(isTrainingCopy
                                ? []
                                : [
                                      {
                                          title: t(
                                              'projectSettings.allProjects',
                                          ),
                                          to: '/generalSettings/projectManagement',
                                      },
                                  ]),
                            {
                                title: project.name,
                                active: true,
                            },
                        ]}
                    />
                </SettingsPageContainer>
                {project.provisioningSource === 'analytics' ? (
                    <ProjectSettingsPage
                        title={t(
                            'projectSettings.pages.managedAnalytics.title',
                        )}
                        description={t(
                            'projectSettings.pages.managedAnalytics.description',
                        )}
                    >
                        <Callout
                            variant="warning"
                            title={t('projectSettings.managedAnalyticsWarning')}
                        />
                    </ProjectSettingsPage>
                ) : (
                    routesElements
                )}
            </Stack>
        </>
    );
};

export default ProjectSettings;
