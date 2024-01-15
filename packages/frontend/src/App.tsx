import { Ability } from '@casl/ability';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Helmet } from 'react-helmet';
import { BrowserRouter as Router } from 'react-router-dom';
import { AbilityContext } from './components/common/Authorization';
import MobileRoutes from './MobileRoutes';
import { ActiveJobProvider } from './providers/ActiveJobProvider';
import { AppProvider } from './providers/AppProvider';
import { ErrorLogsProvider } from './providers/ErrorLogsProvider';
import MantineProvider from './providers/MantineProvider';
import ThirdPartyProvider from './providers/ThirdPartyServicesProvider';
import { TrackingProvider } from './providers/TrackingProvider';
import Routes from './Routes';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30000, // 30 seconds
            refetchOnWindowFocus: false,
            onError: async (result) => {
                // @ts-ignore
                const { error: { statusCode } = {} } = result;
                if (statusCode === 401) {
                    await queryClient.invalidateQueries(['health']);
                }
            },
        },
    },
});

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

        <QueryClientProvider client={queryClient}>
            <MantineProvider>
                <AppProvider>
                    <Router>
                        <ThirdPartyProvider
                            enabled={isMobile || !isMinimalPage}
                        >
                            <TrackingProvider
                                enabled={isMobile || !isMinimalPage}
                            >
                                <AbilityContext.Provider value={defaultAbility}>
                                    <ActiveJobProvider>
                                        <ErrorLogsProvider>
                                            {isMobile ? (
                                                <MobileRoutes />
                                            ) : (
                                                <Routes />
                                            )}
                                        </ErrorLogsProvider>
                                    </ActiveJobProvider>
                                </AbilityContext.Provider>
                            </TrackingProvider>
                        </ThirdPartyProvider>
                    </Router>
                </AppProvider>
            </MantineProvider>

            <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
    </>
);

export default App;
