import { type LanguageMap } from '@lightdash/common';
import { type FC, type PropsWithChildren, useEffect, useState } from 'react';
import { MemoryRouter } from 'react-router';
import { type SdkFilter } from '../src/ee/features/embed/EmbedDashboard/types';
import EmbedDashboard from '../src/ee/pages/EmbedDashboard';
import EmbedProvider from '../src/ee/providers/Embed/EmbedProvider';
import ErrorBoundary from '../src/features/errorBoundary/ErrorBoundary';
import ChartColorMappingContextProvider from '../src/hooks/useChartColorConfig/ChartColorMappingContextProvider';
import AbilityProvider from '../src/providers/Ability/AbilityProvider';
import AppProvider from '../src/providers/App/AppProvider';
import FullscreenProvider from '../src/providers/Fullscreen/FullscreenProvider';
import MantineProvider from '../src/providers/MantineProvider';
import ReactQueryProvider from '../src/providers/ReactQuery/ReactQueryProvider';
import ThirdPartyServicesProvider from '../src/providers/ThirdPartyServicesProvider';
import TrackingProvider from '../src/providers/Tracking/TrackingProvider';
const LIGHTDASH_SDK_INSTANCE_URL_LOCAL_STORAGE_KEY =
    '__lightdash_sdk_instance_url';

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

    const handleDecodeToken = (tokenToDecode: string) => {
        const { payload } = decodeJWT(tokenToDecode);

        if (
            payload &&
            'content' in payload &&
            'projectUuid' in payload.content
        ) {
            setToken(tokenToDecode);
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
                .then((tokenToDecode) => {
                    handleDecodeToken(tokenToDecode);
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

// ts-unused-exports:disable-next-line
export { Dashboard };
// ts-unused-exports:disable-next-line
export default Lightdash;
