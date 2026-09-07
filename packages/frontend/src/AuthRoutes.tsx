import { type RouteObject } from 'react-router';
import { loadLazyRouteDefault } from './features/chunkErrorHandler';
import { TrackPage } from './providers/Tracking/TrackingProvider';
import { PageName } from './types/Events';

const AUTH_ROUTES: RouteObject[] = [
    {
        path: '/auth/popup/:status',
        lazy: async () => {
            const AuthPopupResult = await loadLazyRouteDefault(
                './pages/AuthPopupResult',
                () => import('./pages/AuthPopupResult'),
            );
            return { Component: AuthPopupResult };
        },
    },
    {
        path: '/recover-password',
        lazy: async () => {
            const PasswordRecovery = await loadLazyRouteDefault(
                './pages/PasswordRecovery',
                () => import('./pages/PasswordRecovery'),
            );
            return {
                Component: () => (
                    <TrackPage name={PageName.PASSWORD_RECOVERY}>
                        <PasswordRecovery />
                    </TrackPage>
                ),
            };
        },
    },
    {
        path: '/reset-password/:code',
        lazy: async () => {
            const PasswordReset = await loadLazyRouteDefault(
                './pages/PasswordReset',
                () => import('./pages/PasswordReset'),
            );
            return {
                Component: () => (
                    <TrackPage name={PageName.PASSWORD_RESET}>
                        <PasswordReset />
                    </TrackPage>
                ),
            };
        },
    },
    {
        path: '/invite/:inviteCode',
        lazy: async () => {
            const Invite = await loadLazyRouteDefault(
                './pages/Invite',
                () => import('./pages/Invite'),
            );
            return {
                Component: () => (
                    <TrackPage name={PageName.SIGNUP}>
                        <Invite />
                    </TrackPage>
                ),
            };
        },
    },
    {
        path: '/verify-email',
        lazy: async () => {
            const VerifyEmailPage = await loadLazyRouteDefault(
                './pages/VerifyEmail',
                () => import('./pages/VerifyEmail'),
            );
            return {
                Component: () => (
                    <TrackPage name={PageName.VERIFY_EMAIL}>
                        <VerifyEmailPage />
                    </TrackPage>
                ),
            };
        },
    },
    {
        path: '/join-organization',
        lazy: async () => {
            const JoinOrganization = await loadLazyRouteDefault(
                './pages/JoinOrganization',
                () => import('./pages/JoinOrganization'),
            );
            return {
                Component: () => (
                    <TrackPage name={PageName.JOIN_ORGANIZATION}>
                        <JoinOrganization />
                    </TrackPage>
                ),
            };
        },
    },
];

export default AUTH_ROUTES;
