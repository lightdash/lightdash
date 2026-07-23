import { ModalsProvider } from '@mantine-8/modals';
import { wrapCreateBrowserRouterV7 } from '@sentry/react';
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router';
import { DocumentTitle } from './components/common/DocumentTitle';
import VersionAutoUpdater from './components/VersionAutoUpdater/VersionAutoUpdater';
import {
    CommercialMobileRoutes,
    CommercialWebAppRoutes,
} from './ee/CommercialRoutes';
import { AiAgentsGlobalProvider } from './ee/features/aiCopilot/components/Launcher/AiAgentsGlobalProvider';
import { parseEmbedThemeParams } from './ee/providers/Embed/parseEmbedThemeParams';
import { installChunkLoadErrorHandler } from './features/chunkErrorHandler';
import ChunkErrorRouteBoundary from './features/errorBoundary/ChunkErrorRouteBoundary';
import ErrorBoundary from './features/errorBoundary/ErrorBoundary';
import { SourceCodeEditorProvider } from './features/sourceCodeEditor';
import ChartColorMappingContextProvider from './hooks/useChartColorConfig/ChartColorMappingContextProvider';
import MobileRoutes from './MobileRoutes';
import AbilityProvider from './providers/Ability/AbilityProvider';
import ActiveJobProvider from './providers/ActiveJob/ActiveJobProvider';
import AppProvider from './providers/App/AppProvider';
import FullscreenProvider from './providers/Fullscreen/FullscreenProvider';
import MantineProvider from './providers/MantineProvider';
import ReactQueryProvider from './providers/ReactQuery/ReactQueryProvider';
import SchedulerJobsProvider from './providers/SchedulerJobs/SchedulerJobsProvider';
import ThirdPartyProvider from './providers/ThirdPartyServicesProvider';
import TrackingProvider from './providers/Tracking/TrackingProvider';
import Routes from './Routes';
import { IS_MOBILE } from './utils/isMobile';

installChunkLoadErrorHandler();

// const isMobile =
//     /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
//         navigator.userAgent,
//     ) || window.innerWidth < 768;

const isMobile = IS_MOBILE;

const isMinimalPage = window.location.pathname.startsWith('/minimal');

// On embed routes, force the color scheme from the ?theme= URL param without
// persisting it to localStorage. This keeps the embed in its configured theme
// while never overriding the viewer's own (shared, cross-tab) theme preference.
// `undefined` everywhere else, so non-embed routes are unaffected.
const embedForcedColorScheme = window.location.pathname.startsWith('/embed')
    ? parseEmbedThemeParams().theme
    : undefined;

// Sentry wrapper for createBrowserRouter
const sentryCreateBrowserRouter =
    wrapCreateBrowserRouterV7(createBrowserRouter);

const router = sentryCreateBrowserRouter([
    {
        path: '/',
        errorElement: <ChunkErrorRouteBoundary />,
        element: (
            <AppProvider>
                <FullscreenProvider enabled={isMobile || !isMinimalPage}>
                    <VersionAutoUpdater />
                    <ThirdPartyProvider enabled={isMobile || !isMinimalPage}>
                        <ErrorBoundary wrapper={{ mt: '4xl' }}>
                            <TrackingProvider
                                enabled={isMobile || !isMinimalPage}
                            >
                                <AbilityProvider>
                                    <ActiveJobProvider>
                                        <SchedulerJobsProvider>
                                            <ChartColorMappingContextProvider>
                                                <SourceCodeEditorProvider>
                                                    <AiAgentsGlobalProvider>
                                                        <Outlet />
                                                    </AiAgentsGlobalProvider>
                                                </SourceCodeEditorProvider>
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
        children: isMobile
            ? [...MobileRoutes, ...CommercialMobileRoutes]
            : [...Routes, ...CommercialWebAppRoutes],
    },
]);
const App = () => (
    <>
        <DocumentTitle />

        <ReactQueryProvider>
            <MantineProvider forceColorScheme={embedForcedColorScheme}>
                <ModalsProvider>
                    <RouterProvider router={router} />
                </ModalsProvider>
            </MantineProvider>
        </ReactQueryProvider>
    </>
);

export default App;
