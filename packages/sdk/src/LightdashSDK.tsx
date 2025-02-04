import {
    AbilityProvider,
    ActiveJobProvider,
    AppProvider,
    ChartColorMappingContextProvider,
    createBrowserRouter,
    EmbedDashboard,
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

type Props = {
    projectUuid: string;
    embedToken: string;
    lightdashBaseUrl?: string;
};

const LightdashSDK: FC<Props> = ({
    embedToken,
    projectUuid,
    lightdashBaseUrl,
}) => {
    const router = createBrowserRouter([
        {
            path: '/',
            element: (
                <AppProvider>
                    <ThirdPartyServicesProvider enabled={false}>
                        <ErrorBoundary wrapper={{ mt: '4xl' }}>
                            <TrackingProvider enabled={true}>
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
                    path: '/:projectUuid',
                    element: (
                        <EmbedProvider embedToken={embedToken}>
                            <EmbedDashboard
                                projectUuid={projectUuid}
                                baseUrl={lightdashBaseUrl}
                            />
                        </EmbedProvider>
                    ),
                },
            ],
        },
    ]);

    return (
        <ReactQueryProvider>
            <MantineProvider>
                <RouterProvider router={router} />
            </MantineProvider>
        </ReactQueryProvider>
    );
};

export default LightdashSDK;
