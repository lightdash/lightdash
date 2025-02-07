import {
    AbilityProvider,
    ActiveJobProvider,
    AppProvider,
    ChartColorMappingContextProvider,
    EmbedDashboard,
    EmbedProvider,
    ErrorBoundary,
    FullscreenProvider,
    MantineProvider,
    MemoryRouter,
    ReactQueryProvider,
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

    return (
        <ReactQueryProvider>
            <MantineProvider>
                <AppProvider>
                    <FullscreenProvider enabled={false}>
                        <ThirdPartyServicesProvider enabled={false}>
                            <ErrorBoundary wrapper={{ mt: '4xl' }}>
                                <MemoryRouter>
                                    <TrackingProvider enabled={true}>
                                        <AbilityProvider>
                                            <ActiveJobProvider>
                                                <ChartColorMappingContextProvider>
                                                    <EmbedProvider
                                                        embedToken={token}
                                                    >
                                                        <div
                                                            style={{
                                                                width: '100%',
                                                                height: '100%',
                                                                position:
                                                                    'relative',
                                                                overflow:
                                                                    'auto',
                                                            }}
                                                        >
                                                            <EmbedDashboard
                                                                projectUuid={
                                                                    projectUuid
                                                                }
                                                            />
                                                        </div>
                                                    </EmbedProvider>
                                                </ChartColorMappingContextProvider>
                                            </ActiveJobProvider>
                                        </AbilityProvider>
                                    </TrackingProvider>
                                </MemoryRouter>
                            </ErrorBoundary>
                        </ThirdPartyServicesProvider>
                    </FullscreenProvider>
                </AppProvider>
            </MantineProvider>
        </ReactQueryProvider>
    );
};

const LightdashSDK = { Dashboard };

export default LightdashSDK;
