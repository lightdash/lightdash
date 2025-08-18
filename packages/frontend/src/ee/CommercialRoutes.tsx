import { MantineProvider } from '@mantine-8/core';
import { Navigate, Outlet, type RouteObject } from 'react-router';
import NavBar from '../components/NavBar';
import PrivateRoute from '../components/PrivateRoute';
import { getMantine8ThemeOverride } from '../mantine8Theme';
import { TrackPage } from '../providers/Tracking/TrackingProvider';
import { PageName } from '../types/Events';
import { AiAgentThreadStreamStoreProvider } from './features/aiCopilot/streaming/AiAgentThreadStreamStoreProvider';
import EmbeddedApp from './features/embed/EmbeddedApp';
import AgentPage from './pages/AiAgents/AgentPage';
import AgentsRedirect from './pages/AiAgents/AgentsRedirect';
import AgentsWelcome from './pages/AiAgents/AgentsWelcome';
import AiAgentThreadPage from './pages/AiAgents/AgentThreadPage';
import AiAgentNewThreadPage from './pages/AiAgents/AiAgentNewThreadPage';
import AiAgentsNotAuthorizedPage from './pages/AiAgents/AiAgentsNotAuthorizedPage';
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
                <NavBar />
                <MantineProvider theme={getMantine8ThemeOverride()}>
                    <AiAgentThreadStreamStoreProvider>
                        <Outlet />
                    </AiAgentThreadStreamStoreProvider>
                </MantineProvider>
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

export const CommercialMobileRoutes = [...COMMERCIAL_EMBED_ROUTES];
