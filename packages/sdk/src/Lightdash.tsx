import {
    AbilityProvider,
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
    type LanguageMap,
    type SdkFilter,
} from '@lightdash/frontend';
import { FC, PropsWithChildren, useEffect, useState } from 'react';

type Props = {
    instanceUrl: string;
    token: Promise<string> | string;
    styles?: {
        backgroundColor?: string;
        fontFamily?: string;
    };
    filters?: SdkFilter[];
    contentOverrides?: LanguageMap;
};

const decodeJWT = (token: string) => {
    const splits = token.split('.');
    if (splits.length !== 3) {
        throw new Error('Invalid JWT token');
    }

    const [header, payload, signature] = splits;

    const decodedHeader = JSON.parse(atob(header));
    const decodedPayload = JSON.parse(atob(payload));

    return {
        header: decodedHeader,
        payload: decodedPayload,
        signature: signature,
    };
};

const persistInstanceUrl = (instanceUrl: string) => {
    if (!instanceUrl.endsWith('/')) {
        instanceUrl = `${instanceUrl}/`;
    }

    sessionStorage.setItem(
        LIGHTDASH_SDK_INSTANCE_URL_LOCAL_STORAGE_KEY,
        instanceUrl,
    );
};

const SdkProviders: FC<
    PropsWithChildren<{
        styles?: { backgroundColor?: string; fontFamily?: string };
    }>
> = ({ children, styles }) => {
    return (
        <ReactQueryProvider>
            <MantineProvider
                themeOverride={{
                    fontFamily: styles?.fontFamily,
                    other: {
                        tableFont: styles?.fontFamily,
                        chartFont: styles?.fontFamily,
                    },
                }}
                notificationsLimit={0}
            >
                <AppProvider>
                    <FullscreenProvider enabled={false}>
                        <ThirdPartyServicesProvider enabled={false}>
                            <ErrorBoundary wrapper={{ mt: '4xl' }}>
                                <MemoryRouter>
                                    <TrackingProvider enabled={true}>
                                        <AbilityProvider>
                                            <ChartColorMappingContextProvider>
                                                {children}
                                            </ChartColorMappingContextProvider>
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

const Dashboard: FC<Props> = ({
    token: tokenOrTokenPromise,
    instanceUrl,
    styles,
    filters,
    contentOverrides,
}) => {
    const [token, setToken] = useState<string | null>(null);
    const [projectUuid, setProjectUuid] = useState<string | null>(null);

    const handleDecodeToken = (token: string) => {
        const { payload } = decodeJWT(token);

        if (
            payload &&
            'content' in payload &&
            'projectUuid' in payload.content
        ) {
            setToken(token);
            setProjectUuid(payload.content.projectUuid);
        } else {
            throw new Error('Error decoding token');
        }
    };

    useEffect(() => {
        persistInstanceUrl(instanceUrl);

        if (typeof tokenOrTokenPromise === 'string') {
            handleDecodeToken(tokenOrTokenPromise);
        } else {
            tokenOrTokenPromise
                .then((token) => {
                    handleDecodeToken(token);
                })
                .catch((error) => {
                    console.error(error);
                    throw new Error('Error retrieving token');
                });
        }
    }, [instanceUrl, tokenOrTokenPromise]);

    if (!token || !projectUuid) {
        return null;
    }

    return (
        <SdkProviders styles={styles}>
            <EmbedProvider
                embedToken={token}
                projectUuid={projectUuid}
                filters={filters}
                contentOverrides={contentOverrides}
            >
                <EmbedDashboard
                    containerStyles={{
                        width: '100%',
                        height: '100%',
                        position: 'relative',
                        overflow: 'auto',
                        backgroundColor: styles?.backgroundColor,
                    }}
                />
            </EmbedProvider>
        </SdkProviders>
    );
};

const Lightdash = { Dashboard };

export default Lightdash;
