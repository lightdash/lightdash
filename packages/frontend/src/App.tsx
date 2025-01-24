import { Ability } from '@casl/ability';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router';
import { AbilityContext } from './components/common/Authorization/context';
import VersionAutoUpdater from './components/VersionAutoUpdater/VersionAutoUpdater';
import {
    CommercialMobileRoutes,
    CommercialWebAppRoutes,
} from './ee/CommercialRoutes';
import { ErrorBoundary } from './features/errorBoundary';
import ChartColorMappingContextProvider from './hooks/useChartColorConfig/ChartColorMappingContextProvider';
import MobileRoutes from './MobileRoutes';
import ActiveJobProvider from './providers/ActiveJob/ActiveJobProvider';
import AppProvider from './providers/App/AppProvider';
import MantineProvider from './providers/MantineProvider';
import ReactQueryProvider from './providers/ReactQuery/ReactQueryProvider';
import ThirdPartyProvider from './providers/ThirdPartyServicesProvider';
import { TrackingProvider } from './providers/Tracking/TrackingProvider';
import Routes from './Routes';

const defaultAbility = new Ability();

// const isMobile =
//     /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
//         navigator.userAgent,
//     ) || window.innerWidth < 768;

const isMobile = window.innerWidth < 768;

const isMinimalPage = window.location.pathname.startsWith('/minimal');

const router = createBrowserRouter([
    {
        path: '/',
        element: (
            <AppProvider>
                <VersionAutoUpdater />
                <ThirdPartyProvider enabled={isMobile || !isMinimalPage}>
                    <ErrorBoundary wrapper={{ mt: '4xl' }}>
                        <TrackingProvider enabled={isMobile || !isMinimalPage}>
                            <AbilityContext.Provider value={defaultAbility}>
                                <ActiveJobProvider>
                                    <ChartColorMappingContextProvider>
                                        <Outlet />
                                    </ChartColorMappingContextProvider>
                                </ActiveJobProvider>
                            </AbilityContext.Provider>
                        </TrackingProvider>
                    </ErrorBoundary>
                </ThirdPartyProvider>
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
            <MantineProvider>
                <RouterProvider router={router} />
            </MantineProvider>
            <ReactQueryDevtools initialIsOpen={false} />
        </ReactQueryProvider>
    </>
);

export default App;
