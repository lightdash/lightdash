import React from 'react';
import { Navigate, Outlet, type RouteObject } from 'react-router';
import AppRoute from '../components/AppRoute';
import NavBar from '../components/NavBar';
import ProjectRoute from '../components/ProjectRoute';
import { TrackPage } from '../providers/Tracking/TrackingProvider';
import { PageName } from '../types/Events';
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
            <AppRoute>
                <ProjectRoute>
                    <Outlet />
                </ProjectRoute>
            </AppRoute>
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

export const CommercialWebAppRoutes = [
    ...COMMERCIAL_EMBED_ROUTES,
    ...COMMERCIAL_AI_ROUTES,
];

export const CommercialMobileRoutes = [...COMMERCIAL_EMBED_ROUTES];
