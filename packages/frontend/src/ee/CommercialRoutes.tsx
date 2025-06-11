import { MantineProvider } from '@mantine-8/core';
import { Navigate, Outlet, type RouteObject } from 'react-router';
import NavBar from '../components/NavBar';
import PrivateRoute from '../components/PrivateRoute';
import { getMantine8ThemeOverride } from '../mantine8Theme';
import { TrackPage } from '../providers/Tracking/TrackingProvider';
import { PageName } from '../types/Events';
import AgentPage from './pages/AiAgents/AgentPage';
import AgentsListPage from './pages/AiAgents/AgentsListPage';
import AiAgentThreadPage from './pages/AiAgents/AgentThreadPage';
import AiAgentNewThreadPage from './pages/AiAgents/AiAgentNewThreadPage';
import AiConversationsPage from './pages/AiConversations';
import EmbedDashboard from './pages/EmbedDashboard';
import EmbedProvider from './providers/Embed/EmbedProvider';

const COMMERCIAL_EMBED_ROUTES: RouteObject[] = [
    {
        path: '/embed',
        element: (
            <EmbedProvider>
                <Outlet />
            </EmbedProvider>
        ),
        children: [
            {
                path: '/embed/:projectUuid',
                element: (
                    <TrackPage name={PageName.EMBED_DASHBOARD}>
                        <EmbedDashboard />
                    </TrackPage>
                ),
            },
        ],
    },
];

const COMMERCIAL_AI_ROUTES: RouteObject[] = [
    {
        path: '/projects/:projectUuid/ai',
        element: (
            <PrivateRoute>
                <Outlet />
            </PrivateRoute>
        ),
        children: [
            ...[
                '/projects/:projectUuid/ai/conversations/:threadUuid/:promptUuid',
                '/projects/:projectUuid/ai/conversations/:threadUuid',
                '/projects/:projectUuid/ai/conversations',
            ].map((path) => {
                return {
                    path,
                    element: (
                        <>
                            <NavBar />
                            <AiConversationsPage />
                        </>
                    ),
                };
            }),
            {
                path: '*',
                element: <Navigate to={'conversations'} />,
            },
        ],
    },
];

const COMMERCIAL_AI_AGENTS_ROUTES: RouteObject[] = [
    {
        path: '/projects/:projectUuid/ai-agents',
        element: (
            <PrivateRoute>
                <NavBar />
                <MantineProvider theme={getMantine8ThemeOverride()}>
                    <Outlet />
                </MantineProvider>
            </PrivateRoute>
        ),
        children: [
            {
                index: true,
                element: <AgentsListPage />,
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

export const CommercialWebAppRoutes = [
    ...COMMERCIAL_EMBED_ROUTES,
    ...COMMERCIAL_AI_ROUTES,
    ...COMMERCIAL_AI_AGENTS_ROUTES,
];

export const CommercialMobileRoutes = [...COMMERCIAL_EMBED_ROUTES];
