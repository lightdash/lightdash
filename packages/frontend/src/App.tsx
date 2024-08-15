import { Ability } from '@casl/ability';
import '@mantine/core/styles.css';
import { emotionTransform, MantineEmotionProvider } from '@mantine/emotion';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Helmet } from 'react-helmet';
import { BrowserRouter as Router } from 'react-router-dom';
import { AbilityContext } from './components/common/Authorization';
import VersionAutoUpdater from './components/VersionAutoUpdater/VersionAutoUpdater';
import { ErrorBoundary } from './features/errorBoundary';
import { ChartColorMappingContextProvider } from './hooks/useChartColorConfig';
import MobileRoutes from './MobileRoutes';
import { ActiveJobProvider } from './providers/ActiveJobProvider';
import { AppProvider } from './providers/AppProvider';
import MantineProvider from './providers/MantineProvider';
import ReactQueryProvider from './providers/ReactQueryProvider';
import ThirdPartyProvider from './providers/ThirdPartyServicesProvider';
import { TrackingProvider } from './providers/TrackingProvider';
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
            <MantineProvider stylesTransform={emotionTransform}>
                <MantineEmotionProvider>
                    <Router>
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
                    </Router>
                </MantineEmotionProvider>
            </MantineProvider>

            <ReactQueryDevtools initialIsOpen={false} />
        </ReactQueryProvider>
    </>
);

export default App;
