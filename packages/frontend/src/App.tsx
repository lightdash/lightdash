import { ModalsProvider } from '@mantine/modals';
import { wrapCreateBrowserRouterV7 } from '@sentry/react';
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router';
import VersionAutoUpdater from './components/VersionAutoUpdater/VersionAutoUpdater';
import {
    CommercialMobileRoutes,
    CommercialWebAppRoutes,
} from './ee/CommercialRoutes';
import ErrorBoundary from './features/errorBoundary/ErrorBoundary';
import ChartColorMappingContextProvider from './hooks/useChartColorConfig/ChartColorMappingContextProvider';
import MobileRoutes from './MobileRoutes';
import AbilityProvider from './providers/Ability/AbilityProvider';
import ActiveJobProvider from './providers/ActiveJob/ActiveJobProvider';
import AppProvider from './providers/App/AppProvider';
import FullscreenProvider from './providers/Fullscreen/FullscreenProvider';
import Mantine8Provider from './providers/Mantine8Provider';
import MantineProvider from './providers/MantineProvider';
import ReactQueryProvider from './providers/ReactQuery/ReactQueryProvider';
import ThirdPartyProvider from './providers/ThirdPartyServicesProvider';
import TrackingProvider from './providers/Tracking/TrackingProvider';
import Routes from './Routes';

// const isMobile =
//     /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
//         navigator.userAgent,
//     ) || window.innerWidth < 768;

const isMobile = window.innerWidth < 768;

const isMinimalPage = window.location.pathname.startsWith('/minimal');

// Sentry wrapper for createBrowserRouter
const sentryCreateBrowserRouter =
    wrapCreateBrowserRouterV7(createBrowserRouter);

const router = sentryCreateBrowserRouter([
    {
        path: '/',
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
                                        <ChartColorMappingContextProvider>
                                            <Outlet />
                                        </ChartColorMappingContextProvider>
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
        <title>Lightdash</title>

        <ReactQueryProvider>
            <MantineProvider withGlobalStyles withNormalizeCSS withCSSVariables>
                <Mantine8Provider>
                    <ModalsProvider>
                        <RouterProvider router={router} />
                    </ModalsProvider>
                </Mantine8Provider>
            </MantineProvider>
        </ReactQueryProvider>
    </>
);

export default App;
