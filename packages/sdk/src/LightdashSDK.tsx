import {
    AbilityProvider,
    ActiveJobProvider,
    AppProvider,
    ChartColorMappingContextProvider,
    createBrowserRouter,
    createEmotionCache,
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
import { FC, useCallback, useEffect, useRef, useState } from 'react';

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

    const [emotionCache, setEmotionCache] = useState(undefined);

    const containerRef = useCallback(
        (node) => {
            if (node !== null && !emotionCache) {
                const cache = createEmotionCache({
                    key: 'mantine-subtree',
                    container: node,
                });
                setEmotionCache(cache);
            }
        },
        [emotionCache],
    );

    if (!token) {
        return null;
    }

    const router = createBrowserRouter([
        {
            path: '*',
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
                    path: '*',
                    element: (
                        <EmbedProvider embedToken={token}>
                            <div ref={containerRef}>
                                <EmbedDashboard projectUuid={projectUuid} />
                            </div>
                        </EmbedProvider>
                    ),
                },
            ],
        },
    ]);

    return (
        <ReactQueryProvider>
            <MantineProvider emotionCache={emotionCache}>
                <RouterProvider router={router} />
            </MantineProvider>
        </ReactQueryProvider>
    );
};

const LightdashSDK = { Dashboard };

export default LightdashSDK;
