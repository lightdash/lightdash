import { ModalsProvider } from '@mantine/modals';
import { wrapCreateBrowserRouterV7 } from '@sentry/react';
import { type FC, type PropsWithChildren } from 'react';
import { flushSync } from 'react-dom';
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router';
import { APP_ROUTES } from './AppRoutes';
import { DocumentTitle } from './components/common/DocumentTitle';
import { ColumnWindowingProvider } from './components/common/Table/ColumnWindowingProvider';
import VersionAutoUpdater from './components/VersionAutoUpdater/VersionAutoUpdater';
import { AiAgentsGlobalProvider } from './ee/features/aiCopilot/components/Launcher/AiAgentsGlobalProvider';
import { parseEmbedThemeParams } from './ee/providers/Embed/parseEmbedThemeParams';
import BuildSkewRefresher from './features/buildHashHandshake/BuildSkewRefresher';
import { installChunkLoadErrorHandler } from './features/chunkErrorHandler/chunkErrorHandler';
import ChunkErrorRouteBoundary from './features/errorBoundary/ChunkErrorRouteBoundary';
import ErrorBoundary from './features/errorBoundary/ErrorBoundary';
import { observeMobileUpsellNavigation } from './features/mobile/upsell/getMobileUpsell';
import ChartColorMappingContextProvider from './hooks/useChartColorConfig/ChartColorMappingContextProvider';
import AbilityProvider from './providers/Ability/AbilityProvider';
import ActiveJobProvider from './providers/ActiveJob/ActiveJobProvider';
import AppProvider from './providers/App/AppProvider';
import useApp from './providers/App/useApp';
import FullscreenProvider from './providers/Fullscreen/FullscreenProvider';
import MantineProvider from './providers/MantineProvider';
import ReactQueryProvider from './providers/ReactQuery/ReactQueryProvider';
import SchedulerJobsProvider from './providers/SchedulerJobs/SchedulerJobsProvider';
import ThirdPartyProvider from './providers/ThirdPartyServicesProvider';
import TrackingProvider from './providers/Tracking/TrackingProvider';

installChunkLoadErrorHandler();

const isMinimalPage = window.location.pathname.startsWith('/minimal');

// On embed routes, force the color scheme from the ?theme= URL param without
// persisting it to localStorage. This keeps the embed in its configured theme
// while never overriding the viewer's own (shared, cross-tab) theme preference.
// `undefined` everywhere else, so non-embed routes are unaffected.
const embedForcedColorScheme = window.location.pathname.startsWith('/embed')
    ? parseEmbedThemeParams().theme
    : undefined;

// Static capture pages render every column, so they never ask for the flag.
const AppColumnWindowing: FC<PropsWithChildren> = ({ children }) => {
    const { user } = useApp();
    return (
        <ColumnWindowingProvider enabled={!isMinimalPage && !!user.data}>
            {children}
        </ColumnWindowingProvider>
    );
};

// Sentry wrapper for createBrowserRouter
const sentryCreateBrowserRouter =
    wrapCreateBrowserRouterV7(createBrowserRouter);

const router = sentryCreateBrowserRouter([
    {
        path: '/',
        errorElement: <ChunkErrorRouteBoundary />,
        element: (
            <AppProvider>
                <FullscreenProvider enabled={!isMinimalPage}>
                    <VersionAutoUpdater />
                    <BuildSkewRefresher />
                    <ThirdPartyProvider enabled={!isMinimalPage}>
                        <ErrorBoundary wrapper={{ mt: '4xl' }}>
                            <TrackingProvider enabled={!isMinimalPage}>
                                <AbilityProvider>
                                    <ActiveJobProvider>
                                        <SchedulerJobsProvider>
                                            <ChartColorMappingContextProvider>
                                                <AiAgentsGlobalProvider>
                                                    <AppColumnWindowing>
                                                        <Outlet />
                                                    </AppColumnWindowing>
                                                </AiAgentsGlobalProvider>
                                            </ChartColorMappingContextProvider>
                                        </SchedulerJobsProvider>
                                    </ActiveJobProvider>
                                </AbilityProvider>
                            </TrackingProvider>
                        </ErrorBoundary>
                    </ThirdPartyProvider>
                </FullscreenProvider>
            </AppProvider>
        ),
        children: APP_ROUTES,
    },
]);

observeMobileUpsellNavigation(router.state.location);
router.subscribe(({ location }) => observeMobileUpsellNavigation(location));

const flushRouterUpdate = (callback: () => unknown) => {
    flushSync(callback);
    return undefined;
};

const App = () => (
    <>
        <DocumentTitle />

        <ReactQueryProvider>
            <MantineProvider forceColorScheme={embedForcedColorScheme}>
                <ModalsProvider>
                    <RouterProvider
                        router={router}
                        flushSync={flushRouterUpdate}
                    />
                </ModalsProvider>
            </MantineProvider>
        </ReactQueryProvider>
    </>
);

export default App;
