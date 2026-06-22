import { Navigate, type RouteObject } from 'react-router';
import PrivateRoute from '../components/PrivateRoute';
import { TrackPage } from '../providers/Tracking/TrackingProvider';
import { PageName } from '../types/Events';

const COMMERCIAL_EMBED_ROUTES: RouteObject[] = [
    {
        path: '/embed',
        handle: { hideAILauncher: true },
        lazy: async () => {
            const { default: EmbeddedApp } =
                await import('./features/embed/EmbeddedApp');
            return { Component: EmbeddedApp };
        },
        children: [
            {
                path: '/embed/:projectUuid',
                lazy: async () => {
                    const { default: EmbedDashboard } =
                        await import('./pages/EmbedDashboard');
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
                    const { default: EmbedDashboard } =
                        await import('./pages/EmbedDashboard');
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
                    const { default: EmbedChart } =
                        await import('./pages/EmbedChart');
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
                    const { default: EmbedApp } =
                        await import('./pages/EmbedApp');
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
                path: '/embed/:projectUuid/explore/:exploreId',
                lazy: async () => {
                    const { default: EmbedExplore } =
                        await import('./pages/EmbedExplore');
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
                    const { default: AiAgentsNotAuthorizedPage } =
                        await import('./pages/AiAgents/AiAgentsNotAuthorizedPage');
                    return { Component: AiAgentsNotAuthorizedPage };
                },
            },
            {
                path: '/embed/:projectUuid/ai-agents/:agentUuid',
                lazy: async () => {
                    const { default: AgentPage } =
                        await import('./pages/AiAgents/AgentPage');
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
                                    const { default: AiAgentNewThreadPage } =
                                        await import('./pages/AiAgents/AiAgentNewThreadPage');
                                    return {
                                        Component: AiAgentNewThreadPage,
                                    };
                                },
                            },
                            {
                                path: ':threadUuid/messages/:promptUuid/debug',
                                lazy: async () => {
                                    const { default: AiAgentThreadPage } =
                                        await import('./pages/AiAgents/AgentThreadPage');
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
                                    const { default: AiAgentThreadPage } =
                                        await import('./pages/AiAgents/AgentThreadPage');
                                    return { Component: AiAgentThreadPage };
                                },
                            },
                            {
                                path: ':threadUuid',
                                lazy: async () => {
                                    const { default: AiAgentThreadPage } =
                                        await import('./pages/AiAgents/AgentThreadPage');
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
        element: <Navigate to="/generalSettings/ai/reviews" replace />,
    },
    {
        path: '/ai-agents/',
        lazy: async () => {
            const { default: AgentsRedirect } =
                await import('./pages/AiAgents/AgentsRedirect');
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
            const { default: AiAgentsRootLayout } =
                await import('./pages/AiAgents/AiAgentsRootLayout');
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
                    const { default: AgentsWelcome } =
                        await import('./pages/AiAgents/AgentsWelcome');
                    return { Component: AgentsWelcome };
                },
            },
            {
                path: 'not-authorized',
                lazy: async () => {
                    const { default: AiAgentsNotAuthorizedPage } =
                        await import('./pages/AiAgents/AiAgentsNotAuthorizedPage');
                    return { Component: AiAgentsNotAuthorizedPage };
                },
            },
            {
                path: 'new',
                lazy: async () => {
                    const { default: ProjectAiAgentEditPage } =
                        await import('./pages/AiAgents/ProjectAiAgentEditPage');
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
                    const { default: AiAgentThreadSharePage } =
                        await import('./pages/AiAgents/AiAgentThreadSharePage');
                    return { Component: AiAgentThreadSharePage };
                },
            },
            {
                path: ':agentUuid/edit',
                lazy: async () => {
                    const { default: ProjectAiAgentEditPage } =
                        await import('./pages/AiAgents/ProjectAiAgentEditPage');
                    return { Component: ProjectAiAgentEditPage };
                },
                children: [
                    {
                        path: 'evals',
                        lazy: async () => {
                            const { default: ProjectAiAgentEditPage } =
                                await import('./pages/AiAgents/ProjectAiAgentEditPage');
                            return { Component: ProjectAiAgentEditPage };
                        },
                    },
                    {
                        path: 'evals/:evalUuid',
                        lazy: async () => {
                            const { default: ProjectAiAgentEditPage } =
                                await import('./pages/AiAgents/ProjectAiAgentEditPage');
                            return { Component: ProjectAiAgentEditPage };
                        },
                    },
                    {
                        path: 'evals/:evalUuid/run/:runUuid',
                        lazy: async () => {
                            const { default: ProjectAiAgentEditPage } =
                                await import('./pages/AiAgents/ProjectAiAgentEditPage');
                            return { Component: ProjectAiAgentEditPage };
                        },
                    },
                    {
                        path: 'verified-artifacts',
                        lazy: async () => {
                            const { default: ProjectAiAgentEditPage } =
                                await import('./pages/AiAgents/ProjectAiAgentEditPage');
                            return { Component: ProjectAiAgentEditPage };
                        },
                    },
                    {
                        path: 'verified-artifacts/:artifactUuid',
                        lazy: async () => {
                            const { default: ProjectAiAgentEditPage } =
                                await import('./pages/AiAgents/ProjectAiAgentEditPage');
                            return { Component: ProjectAiAgentEditPage };
                        },
                    },
                ],
            },
            {
                path: ':agentUuid',
                lazy: async () => {
                    const { default: AgentPage } =
                        await import('./pages/AiAgents/AgentPage');
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
                                    const { default: AiAgentNewThreadPage } =
                                        await import('./pages/AiAgents/AiAgentNewThreadPage');
                                    return {
                                        Component: AiAgentNewThreadPage,
                                    };
                                },
                            },
                            {
                                path: ':threadUuid/messages/:promptUuid/debug',
                                lazy: async () => {
                                    const { default: AiAgentThreadPage } =
                                        await import('./pages/AiAgents/AgentThreadPage');
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
                                    const { default: AiAgentThreadPage } =
                                        await import('./pages/AiAgents/AgentThreadPage');
                                    return { Component: AiAgentThreadPage };
                                },
                            },
                            {
                                path: ':threadUuid',
                                lazy: async () => {
                                    const { default: AiAgentThreadPage } =
                                        await import('./pages/AiAgents/AgentThreadPage');
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
            const { default: SlackAuthSuccess } =
                await import('./pages/SlackAuthSuccess');
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
