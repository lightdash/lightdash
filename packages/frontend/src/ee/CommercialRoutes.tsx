import { Navigate, type RouteObject } from 'react-router';
import PrivateRoute from '../components/PrivateRoute';
import { loadLazyRouteDefault } from '../features/chunkErrorHandler';
import { TrackPage } from '../providers/Tracking/TrackingProvider';
import { PageName } from '../types/Events';

const COMMERCIAL_EMBED_ROUTES: RouteObject[] = [
    {
        path: '/embed',
        handle: { hideAILauncher: true },
        lazy: async () => {
            const EmbeddedApp = await loadLazyRouteDefault(
                './features/embed/EmbeddedApp',
                () => import('./features/embed/EmbeddedApp'),
            );
            return { Component: EmbeddedApp };
        },
        children: [
            {
                path: '/embed/:projectUuid',
                lazy: async () => {
                    const EmbedDashboard = await loadLazyRouteDefault(
                        './pages/EmbedDashboard',
                        () => import('./pages/EmbedDashboard'),
                    );
                    return {
                        Component: () => (
                            <TrackPage name={PageName.EMBED_DASHBOARD}>
                                <EmbedDashboard />
                            </TrackPage>
                        ),
                    };
                },
            },
            {
                path: '/embed/:projectUuid/tabs/:tabUuid',
                lazy: async () => {
                    const EmbedDashboard = await loadLazyRouteDefault(
                        './pages/EmbedDashboard',
                        () => import('./pages/EmbedDashboard'),
                    );
                    return {
                        Component: () => (
                            <TrackPage name={PageName.EMBED_DASHBOARD}>
                                <EmbedDashboard />
                            </TrackPage>
                        ),
                    };
                },
            },
            {
                path: '/embed/:projectUuid/chart/:chartUuid',
                lazy: async () => {
                    const EmbedChart = await loadLazyRouteDefault(
                        './pages/EmbedChart',
                        () => import('./pages/EmbedChart'),
                    );
                    return {
                        Component: () => (
                            <TrackPage name={PageName.EMBED_SAVED_CHART}>
                                <EmbedChart />
                            </TrackPage>
                        ),
                    };
                },
            },
            {
                path: '/embed/:projectUuid/app/:appUuid',
                lazy: async () => {
                    const EmbedApp = await loadLazyRouteDefault(
                        './pages/EmbedApp',
                        () => import('./pages/EmbedApp'),
                    );
                    return {
                        Component: () => (
                            <TrackPage name={PageName.EMBED_DATA_APP}>
                                <EmbedApp />
                            </TrackPage>
                        ),
                    };
                },
            },
            {
                path: '/embed/:projectUuid/metrics',
                lazy: async () => {
                    const { default: MetricsCatalog } =
                        await import('../pages/MetricsCatalog');
                    return {
                        Component: () => (
                            <TrackPage name={PageName.METRICS_CATALOG}>
                                <MetricsCatalog />
                            </TrackPage>
                        ),
                    };
                },
            },
            {
                path: '/embed/:projectUuid/explore/:exploreId',
                lazy: async () => {
                    const EmbedExplore = await loadLazyRouteDefault(
                        './pages/EmbedExplore',
                        () => import('./pages/EmbedExplore'),
                    );
                    return {
                        Component: () => (
                            <TrackPage name={PageName.EMBED_EXPLORE}>
                                <EmbedExplore />
                            </TrackPage>
                        ),
                    };
                },
            },
            {
                path: '/embed/:projectUuid/ai-agents/not-authorized',
                lazy: async () => {
                    const AiAgentsNotAuthorizedPage =
                        await loadLazyRouteDefault(
                            './pages/AiAgents/AiAgentsNotAuthorizedPage',
                            () =>
                                import('./pages/AiAgents/AiAgentsNotAuthorizedPage'),
                        );
                    return { Component: AiAgentsNotAuthorizedPage };
                },
            },
            {
                path: '/embed/:projectUuid/ai-agents/:agentUuid',
                lazy: async () => {
                    const AgentPage = await loadLazyRouteDefault(
                        './pages/AiAgents/AgentPage',
                        () => import('./pages/AiAgents/AgentPage'),
                    );
                    return { Component: AgentPage };
                },
                children: [
                    {
                        index: true,
                        element: <Navigate to="threads" replace />,
                    },
                    {
                        path: 'threads',
                        children: [
                            {
                                index: true,
                                lazy: async () => {
                                    const AiAgentNewThreadPage =
                                        await loadLazyRouteDefault(
                                            './pages/AiAgents/AiAgentNewThreadPage',
                                            () =>
                                                import('./pages/AiAgents/AiAgentNewThreadPage'),
                                        );
                                    return {
                                        Component: AiAgentNewThreadPage,
                                    };
                                },
                            },
                            {
                                path: ':threadUuid/messages/:promptUuid/debug',
                                lazy: async () => {
                                    const AiAgentThreadPage =
                                        await loadLazyRouteDefault(
                                            './pages/AiAgents/AgentThreadPage',
                                            () =>
                                                import('./pages/AiAgents/AgentThreadPage'),
                                        );
                                    return {
                                        Component: () => (
                                            <AiAgentThreadPage debug />
                                        ),
                                    };
                                },
                            },
                            {
                                path: ':threadUuid/messages/:promptUuid',
                                lazy: async () => {
                                    const AiAgentThreadPage =
                                        await loadLazyRouteDefault(
                                            './pages/AiAgents/AgentThreadPage',
                                            () =>
                                                import('./pages/AiAgents/AgentThreadPage'),
                                        );
                                    return { Component: AiAgentThreadPage };
                                },
                            },
                            {
                                path: ':threadUuid',
                                lazy: async () => {
                                    const AiAgentThreadPage =
                                        await loadLazyRouteDefault(
                                            './pages/AiAgents/AgentThreadPage',
                                            () =>
                                                import('./pages/AiAgents/AgentThreadPage'),
                                        );
                                    return { Component: AiAgentThreadPage };
                                },
                            },
                        ],
                    },
                ],
            },
        ],
    },
];

const COMMERCIAL_AI_AGENTS_ROUTES: RouteObject[] = [
    {
        path: '/ai-agents/admin',
        element: <Navigate to="/generalSettings/ai/general" replace />,
    },
    {
        path: '/ai-agents/admin/threads',
        element: <Navigate to="/generalSettings/ai/threads" replace />,
    },
    {
        path: '/ai-agents/admin/agents',
        element: <Navigate to="/generalSettings/ai/agents" replace />,
    },
    {
        path: '/ai-agents/admin/reviews',
        element: <Navigate to="/generalSettings/ai/issues" replace />,
    },
    {
        path: '/ai-agents/admin/issues',
        element: <Navigate to="/generalSettings/ai/issues" replace />,
    },
    {
        path: '/ai-agents/',
        lazy: async () => {
            const AgentsRedirect = await loadLazyRouteDefault(
                './pages/AiAgents/AgentsRedirect',
                () => import('./pages/AiAgents/AgentsRedirect'),
            );
            return {
                Component: () => (
                    <PrivateRoute>
                        <AgentsRedirect />
                    </PrivateRoute>
                ),
            };
        },
    },
    {
        path: '/projects/:projectUuid/ai-agents',
        handle: { hideAILauncher: true },
        lazy: async () => {
            const AiAgentsRootLayout = await loadLazyRouteDefault(
                './pages/AiAgents/AiAgentsRootLayout',
                () => import('./pages/AiAgents/AiAgentsRootLayout'),
            );
            return {
                Component: () => (
                    <PrivateRoute>
                        <AiAgentsRootLayout />
                    </PrivateRoute>
                ),
            };
        },
        children: [
            {
                index: true,
                lazy: async () => {
                    const AgentsWelcome = await loadLazyRouteDefault(
                        './pages/AiAgents/AgentsWelcome',
                        () => import('./pages/AiAgents/AgentsWelcome'),
                    );
                    return { Component: AgentsWelcome };
                },
            },
            {
                path: 'not-authorized',
                lazy: async () => {
                    const AiAgentsNotAuthorizedPage =
                        await loadLazyRouteDefault(
                            './pages/AiAgents/AiAgentsNotAuthorizedPage',
                            () =>
                                import('./pages/AiAgents/AiAgentsNotAuthorizedPage'),
                        );
                    return { Component: AiAgentsNotAuthorizedPage };
                },
            },
            {
                path: 'new',
                lazy: async () => {
                    const ProjectAiAgentEditPage = await loadLazyRouteDefault(
                        './pages/AiAgents/ProjectAiAgentEditPage',
                        () => import('./pages/AiAgents/ProjectAiAgentEditPage'),
                    );
                    return {
                        Component: () => (
                            <ProjectAiAgentEditPage isCreateMode />
                        ),
                    };
                },
            },
            {
                path: 'share/:aiThreadShareUuid',
                lazy: async () => {
                    const AiAgentThreadSharePage = await loadLazyRouteDefault(
                        './pages/AiAgents/AiAgentThreadSharePage',
                        () => import('./pages/AiAgents/AiAgentThreadSharePage'),
                    );
                    return { Component: AiAgentThreadSharePage };
                },
            },
            {
                path: ':agentUuid/edit',
                lazy: async () => {
                    const ProjectAiAgentEditPage = await loadLazyRouteDefault(
                        './pages/AiAgents/ProjectAiAgentEditPage',
                        () => import('./pages/AiAgents/ProjectAiAgentEditPage'),
                    );
                    return { Component: ProjectAiAgentEditPage };
                },
                children: [
                    {
                        path: 'evals',
                        lazy: async () => {
                            const ProjectAiAgentEditPage =
                                await loadLazyRouteDefault(
                                    './pages/AiAgents/ProjectAiAgentEditPage',
                                    () =>
                                        import('./pages/AiAgents/ProjectAiAgentEditPage'),
                                );
                            return { Component: ProjectAiAgentEditPage };
                        },
                    },
                    {
                        path: 'evals/:evalUuid',
                        lazy: async () => {
                            const ProjectAiAgentEditPage =
                                await loadLazyRouteDefault(
                                    './pages/AiAgents/ProjectAiAgentEditPage',
                                    () =>
                                        import('./pages/AiAgents/ProjectAiAgentEditPage'),
                                );
                            return { Component: ProjectAiAgentEditPage };
                        },
                    },
                    {
                        path: 'evals/:evalUuid/run/:runUuid',
                        lazy: async () => {
                            const ProjectAiAgentEditPage =
                                await loadLazyRouteDefault(
                                    './pages/AiAgents/ProjectAiAgentEditPage',
                                    () =>
                                        import('./pages/AiAgents/ProjectAiAgentEditPage'),
                                );
                            return { Component: ProjectAiAgentEditPage };
                        },
                    },
                    {
                        path: 'verified-artifacts',
                        lazy: async () => {
                            const ProjectAiAgentEditPage =
                                await loadLazyRouteDefault(
                                    './pages/AiAgents/ProjectAiAgentEditPage',
                                    () =>
                                        import('./pages/AiAgents/ProjectAiAgentEditPage'),
                                );
                            return { Component: ProjectAiAgentEditPage };
                        },
                    },
                    {
                        path: 'verified-artifacts/:artifactUuid',
                        lazy: async () => {
                            const ProjectAiAgentEditPage =
                                await loadLazyRouteDefault(
                                    './pages/AiAgents/ProjectAiAgentEditPage',
                                    () =>
                                        import('./pages/AiAgents/ProjectAiAgentEditPage'),
                                );
                            return { Component: ProjectAiAgentEditPage };
                        },
                    },
                ],
            },
            {
                path: ':agentUuid',
                lazy: async () => {
                    const AgentPage = await loadLazyRouteDefault(
                        './pages/AiAgents/AgentPage',
                        () => import('./pages/AiAgents/AgentPage'),
                    );
                    return { Component: AgentPage };
                },
                children: [
                    {
                        index: true,
                        element: <Navigate to="threads" replace />,
                    },
                    {
                        path: 'threads',
                        children: [
                            {
                                index: true,
                                lazy: async () => {
                                    const AiAgentNewThreadPage =
                                        await loadLazyRouteDefault(
                                            './pages/AiAgents/AiAgentNewThreadPage',
                                            () =>
                                                import('./pages/AiAgents/AiAgentNewThreadPage'),
                                        );
                                    return {
                                        Component: AiAgentNewThreadPage,
                                    };
                                },
                            },
                            {
                                path: ':threadUuid/messages/:promptUuid/debug',
                                lazy: async () => {
                                    const AiAgentThreadPage =
                                        await loadLazyRouteDefault(
                                            './pages/AiAgents/AgentThreadPage',
                                            () =>
                                                import('./pages/AiAgents/AgentThreadPage'),
                                        );
                                    return {
                                        Component: () => (
                                            <AiAgentThreadPage debug />
                                        ),
                                    };
                                },
                            },
                            {
                                path: ':threadUuid/messages/:promptUuid',
                                lazy: async () => {
                                    const AiAgentThreadPage =
                                        await loadLazyRouteDefault(
                                            './pages/AiAgents/AgentThreadPage',
                                            () =>
                                                import('./pages/AiAgents/AgentThreadPage'),
                                        );
                                    return { Component: AiAgentThreadPage };
                                },
                            },
                            {
                                path: ':threadUuid',
                                lazy: async () => {
                                    const AiAgentThreadPage =
                                        await loadLazyRouteDefault(
                                            './pages/AiAgents/AgentThreadPage',
                                            () =>
                                                import('./pages/AiAgents/AgentThreadPage'),
                                        );
                                    return { Component: AiAgentThreadPage };
                                },
                            },
                        ],
                    },
                ],
            },
        ],
    },
];

const COMMERCIAL_SLACK_AUTH_ROUTES: RouteObject[] = [
    {
        path: '/auth/slack/success',
        lazy: async () => {
            const SlackAuthSuccess = await loadLazyRouteDefault(
                './pages/SlackAuthSuccess',
                () => import('./pages/SlackAuthSuccess'),
            );
            return { Component: SlackAuthSuccess };
        },
    },
];

export const CommercialWebAppRoutes = [
    ...COMMERCIAL_EMBED_ROUTES,
    ...COMMERCIAL_AI_AGENTS_ROUTES,
    ...COMMERCIAL_SLACK_AUTH_ROUTES,
];

export const CommercialMobileRoutes = [
    ...COMMERCIAL_EMBED_ROUTES,
    ...COMMERCIAL_AI_AGENTS_ROUTES,
];
