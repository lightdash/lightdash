import { Navigate, type RouteObject } from 'react-router';
import PrivateRoute from '../components/PrivateRoute';
import { TrackPage } from '../providers/Tracking/TrackingProvider';
import { PageName } from '../types/Events';
import EmbeddedApp from './features/embed/EmbeddedApp';
import AgentPage from './pages/AiAgents/AgentPage';
import AgentsRedirect from './pages/AiAgents/AgentsRedirect';
import AgentsWelcome from './pages/AiAgents/AgentsWelcome';
import AiAgentThreadPage from './pages/AiAgents/AgentThreadPage';
import AiAgentNewThreadPage from './pages/AiAgents/AiAgentNewThreadPage';
import AiAgentsNotAuthorizedPage from './pages/AiAgents/AiAgentsNotAuthorizedPage';
import { AiAgentsRootLayout } from './pages/AiAgents/AiAgentsRootLayout';
import AiAgentThreadSharePage from './pages/AiAgents/AiAgentThreadSharePage';
import ProjectAiAgentEditPage from './pages/AiAgents/ProjectAiAgentEditPage';
import EmbedApp from './pages/EmbedApp';
import EmbedChart from './pages/EmbedChart';
import EmbedDashboard from './pages/EmbedDashboard';
import EmbedExplore from './pages/EmbedExplore';
import { SlackAuthSuccess } from './pages/SlackAuthSuccess';

const COMMERCIAL_EMBED_ROUTES: RouteObject[] = [
    {
        path: '/embed',
        handle: { hideAILauncher: true },
        element: <EmbeddedApp />,
        children: [
            {
                path: '/embed/:projectUuid',
                element: (
                    <TrackPage name={PageName.EMBED_DASHBOARD}>
                        <EmbedDashboard />
                    </TrackPage>
                ),
            },
            {
                path: '/embed/:projectUuid/tabs/:tabUuid',
                element: (
                    <TrackPage name={PageName.EMBED_DASHBOARD}>
                        <EmbedDashboard />
                    </TrackPage>
                ),
            },
            {
                path: '/embed/:projectUuid/chart/:chartUuid',
                element: (
                    <TrackPage name={PageName.EMBED_SAVED_CHART}>
                        <EmbedChart />
                    </TrackPage>
                ),
            },
            {
                path: '/embed/:projectUuid/app/:appUuid',
                element: (
                    <TrackPage name={PageName.EMBED_DATA_APP}>
                        <EmbedApp />
                    </TrackPage>
                ),
            },
            {
                path: '/embed/:projectUuid/explore/:exploreId',
                element: (
                    <TrackPage name={PageName.EMBED_EXPLORE}>
                        <EmbedExplore />
                    </TrackPage>
                ),
            },
            {
                path: '/embed/:projectUuid/ai-agents/not-authorized',
                element: <AiAgentsNotAuthorizedPage />,
            },
            {
                path: '/embed/:projectUuid/ai-agents/:agentUuid',
                element: <AgentPage />,
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
                                element: <AiAgentNewThreadPage />,
                            },
                            {
                                path: ':threadUuid/messages/:promptUuid/debug',
                                element: <AiAgentThreadPage debug />,
                            },
                            {
                                path: ':threadUuid/messages/:promptUuid',
                                element: <AiAgentThreadPage />,
                            },
                            {
                                path: ':threadUuid',
                                element: <AiAgentThreadPage />,
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
        element: (
            <PrivateRoute>
                <AgentsRedirect />
            </PrivateRoute>
        ),
    },
    {
        path: '/projects/:projectUuid/ai-agents',
        handle: { hideAILauncher: true },
        element: (
            <PrivateRoute>
                <AiAgentsRootLayout />
            </PrivateRoute>
        ),
        children: [
            {
                index: true,
                element: <AgentsWelcome />,
            },
            {
                path: 'not-authorized',
                element: <AiAgentsNotAuthorizedPage />,
            },
            {
                path: 'new',
                element: <ProjectAiAgentEditPage isCreateMode />,
            },
            {
                path: 'share/:aiThreadShareUuid',
                element: <AiAgentThreadSharePage />,
            },
            {
                path: ':agentUuid/edit',
                element: <ProjectAiAgentEditPage />,
                children: [
                    {
                        path: 'evals',
                        element: <ProjectAiAgentEditPage />,
                    },
                    {
                        path: 'evals/:evalUuid',
                        element: <ProjectAiAgentEditPage />,
                    },
                    {
                        path: 'evals/:evalUuid/run/:runUuid',
                        element: <ProjectAiAgentEditPage />,
                    },
                    {
                        path: 'verified-artifacts',
                        element: <ProjectAiAgentEditPage />,
                    },
                    {
                        path: 'verified-artifacts/:artifactUuid',
                        element: <ProjectAiAgentEditPage />,
                    },
                ],
            },
            {
                path: ':agentUuid',
                element: <AgentPage />,
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
                                element: <AiAgentNewThreadPage />,
                            },
                            {
                                path: ':threadUuid/messages/:promptUuid/debug',
                                element: <AiAgentThreadPage debug />,
                            },
                            {
                                path: ':threadUuid/messages/:promptUuid',
                                element: <AiAgentThreadPage />,
                            },
                            {
                                path: ':threadUuid',
                                element: <AiAgentThreadPage />,
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
        element: <SlackAuthSuccess />,
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
