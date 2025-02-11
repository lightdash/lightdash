import {
    AbilityProvider,
    ActiveJobProvider,
    AppProvider,
    ChartColorMappingContextProvider,
    EmbedDashboard,
    EmbedProvider,
    ErrorBoundary,
    FullscreenProvider,
    LIGHTDASH_SDK_INSTANCE_URL_LOCAL_STORAGE_KEY,
    MantineProvider,
    MemoryRouter,
    ReactQueryProvider,
    ThirdPartyServicesProvider,
    TrackingProvider,
} from '@lightdash/frontend';
import { FC, useEffect, useState } from 'react';

type Props = {
    projectUuid: string;
    token: Promise<string> | string;
    instanceUrl: string;
    styles?: {
        backgroundColor?: string;
        fontFamily?: string;
    };
};

const persistInstanceUrl = (instanceUrl: string) => {
    localStorage.setItem(
        LIGHTDASH_SDK_INSTANCE_URL_LOCAL_STORAGE_KEY,
        instanceUrl,
    );
};

const Dashboard: FC<Props> = ({ token, instanceUrl, projectUuid, styles }) => {
    const [tokenString, setTokenString] = useState<string | null>(null);

    useEffect(() => {
        persistInstanceUrl(instanceUrl);

        if (typeof token === 'string') {
            setTokenString(token);
        } else {
            token.then((t) => {
                setTokenString(t);
            });
        }
    }, [instanceUrl, token]);

    if (!tokenString) {
        return null;
    }

    return (
        <ReactQueryProvider>
            <MantineProvider
                themeOverride={{
                    fontFamily: styles?.fontFamily,
                    other: { tableFont: styles?.fontFamily },
                }}
            >
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
                                                        embedToken={tokenString}
                                                    >
                                                        <div
                                                            style={{
                                                                width: '100%',
                                                                height: '100%',
                                                                position:
                                                                    'relative',
                                                                overflow:
                                                                    'auto',
                                                                backgroundColor:
                                                                    styles?.backgroundColor,
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

const Lightdash = { Dashboard };

export default Lightdash;
