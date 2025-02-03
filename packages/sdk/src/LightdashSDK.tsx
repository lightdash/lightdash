import {
    AbilityProvider,
    ActiveJobProvider,
    AppProvider,
    ChartColorMappingContextProvider,
    createBrowserRouter,
    EmbedProvider,
    ErrorBoundary,
    MantineProvider,
    Outlet,
    ReactQueryProvider,
    RouterProvider,
    ThirdPartyServicesProvider,
    TrackingProvider,
} from '@lightdash/frontend';
import { FC } from 'react';

const router = createBrowserRouter([
    {
        path: '/',
        element: (
            <AppProvider>
                <ThirdPartyServicesProvider enabled={false}>
                    <ErrorBoundary wrapper={{ mt: '4xl' }}>
                        <TrackingProvider enabled={false}>
                            <AbilityProvider>
                                <ActiveJobProvider>
                                    <ChartColorMappingContextProvider>
                                        <Outlet />
                                    </ChartColorMappingContextProvider>
                                </ActiveJobProvider>
                            </AbilityProvider>
                        </TrackingProvider>
                    </ErrorBoundary>
                </ThirdPartyServicesProvider>
            </AppProvider>
        ),
        children: [
            {
                path: '/',
                element: <div>hello wsup</div>,
            },
        ],
    },
]);

type Props = {
    embedToken: string;
};

const LightdashSDK: FC<Props> = ({ embedToken }) => {
    return (
        <ReactQueryProvider
            queryClientOverride={{
                queries: {
                    queryFn: (query) => {
                        console.log('query', query);
                        return query.queryKey;
                    },
                },
            }}
        >
            <MantineProvider>
                <EmbedProvider embedToken={embedToken}>
                    <RouterProvider router={router} />
                </EmbedProvider>
            </MantineProvider>
        </ReactQueryProvider>
    );
};

export default LightdashSDK;
