import { Navigate, Outlet, type RouteObject } from 'react-router';
import NavBar from '../components/NavBar';
import PrivateRoute from '../components/PrivateRoute';
import { TrackPage } from '../providers/Tracking/TrackingProvider';
import { PageName } from '../types/Events';
import EmbeddedApp from './features/embed/EmbeddedApp';
import { AiAgentsAdminPage } from './pages/AiAgents/Admin/AiAgentsAdminPage';
import AgentPage from './pages/AiAgents/AgentPage';
import AgentsRedirect from './pages/AiAgents/AgentsRedirect';
import AgentsWelcome from './pages/AiAgents/AgentsWelcome';
import AiAgentThreadPage from './pages/AiAgents/AgentThreadPage';
import AiAgentNewThreadPage from './pages/AiAgents/AiAgentNewThreadPage';
import AiAgentsNotAuthorizedPage from './pages/AiAgents/AiAgentsNotAuthorizedPage';
import { AiAgentsRootLayout } from './pages/AiAgents/AiAgentsRootLayout';
import ProjectAiAgentEditPage from './pages/AiAgents/ProjectAiAgentEditPage';
import EmbedDashboard from './pages/EmbedDashboard';
import EmbedExplore from './pages/EmbedExplore';
import { SlackAuthSuccess } from './pages/SlackAuthSuccess';

const COMMERCIAL_EMBED_ROUTES: RouteObject[] = [
    {
        path: '/embed',
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
                path: '/embed/:projectUuid/explore/:exploreId',
                element: (
                    <TrackPage name={PageName.EMBED_EXPLORE}>
                        <EmbedExplore />
                    </TrackPage>
                ),
            },
        ],
    },
];

const COMMERCIAL_AI_AGENTS_ROUTES: RouteObject[] = [
    {
        path: '/ai-agents/admin',
        element: (
            <PrivateRoute>
                <NavBar />
                <Outlet />
            </PrivateRoute>
        ),
        children: [
            {
                index: true,
                element: <Navigate to="threads" replace />,
            },
            {
                path: 'threads',
                element: <AiAgentsAdminPage />,
            },
            {
                path: 'agents',
                element: <AiAgentsAdminPage />,
            },
        ],
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
