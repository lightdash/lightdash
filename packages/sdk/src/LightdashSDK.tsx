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
import { FC, useEffect, useState } from 'react';

type Props = {
    projectUuid: string;
    getEmbedToken: Promise<string>;
    instanceUrl: string;
};

const persistInstanceUrl = (instanceUrl: string) => {
    localStorage.setItem(
        // TODO: should be a constant
        '__lightdash_sdk_instance_url',
        instanceUrl,
    );
};

const Dashboard: FC<Props> = ({ getEmbedToken, instanceUrl, projectUuid }) => {
    const [token, setToken] = useState<string | null>(null);

    useEffect(() => {
        getEmbedToken.then((token) => {
            persistInstanceUrl(instanceUrl);
            setToken(token);
        });
    }, [getEmbedToken]);

    if (!token) {
        return null;
    }

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
                        <EmbedProvider embedToken={token}>
                            <EmbedDashboard projectUuid={projectUuid} />
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

const LightdashSDK = { Dashboard };

export default LightdashSDK;
