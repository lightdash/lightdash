import { Ability } from '@casl/ability';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Helmet } from 'react-helmet';
import { BrowserRouter } from 'react-router-dom';
import { CompatRouter } from 'react-router-dom-v5-compat';
import { AbilityContext } from './components/common/Authorization/context';
import VersionAutoUpdater from './components/VersionAutoUpdater/VersionAutoUpdater';
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

const App = () => (
    <>
        <Helmet>
            <title>Lightdash</title>
        </Helmet>

        <ReactQueryProvider>
            <MantineProvider>
                <BrowserRouter>
                    <CompatRouter>
                        <AppProvider>
                            <VersionAutoUpdater />
                            <ThirdPartyProvider
                                enabled={isMobile || !isMinimalPage}
                            >
                                <ErrorBoundary wrapper={{ mt: '4xl' }}>
                                    <TrackingProvider
                                        enabled={isMobile || !isMinimalPage}
                                    >
                                        <AbilityContext.Provider
                                            value={defaultAbility}
                                        >
                                            <ActiveJobProvider>
                                                <ChartColorMappingContextProvider>
                                                    {isMobile ? (
                                                        <MobileRoutes />
                                                    ) : (
                                                        <Routes />
                                                    )}
                                                </ChartColorMappingContextProvider>
                                            </ActiveJobProvider>
                                        </AbilityContext.Provider>
                                    </TrackingProvider>
                                </ErrorBoundary>
                            </ThirdPartyProvider>
                        </AppProvider>
                    </CompatRouter>
                </BrowserRouter>
            </MantineProvider>

            <ReactQueryDevtools initialIsOpen={false} />
        </ReactQueryProvider>
    </>
);

export default App;
