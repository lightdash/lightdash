import '@mantine-8/core/styles.css';

import { type LanguageMap, type SavedChart } from '@lightdash/common';
import { type FC, type PropsWithChildren, useEffect, useState } from 'react';
import { MemoryRouter } from 'react-router';
import { type SdkFilter } from '../src/ee/features/embed/EmbedDashboard/types';
import EmbedChart from '../src/ee/pages/EmbedChart';
import EmbedDashboard from '../src/ee/pages/EmbedDashboard';
import EmbedExplore from '../src/ee/pages/EmbedExplore';
import EmbedProvider from '../src/ee/providers/Embed/EmbedProvider';
import ErrorBoundary from '../src/features/errorBoundary/ErrorBoundary';
import ChartColorMappingContextProvider from '../src/hooks/useChartColorConfig/ChartColorMappingContextProvider';
import AbilityProvider from '../src/providers/Ability/AbilityProvider';
import ActiveJobProvider from '../src/providers/ActiveJob/ActiveJobProvider';
import AppProvider from '../src/providers/App/AppProvider';
import FullscreenProvider from '../src/providers/Fullscreen/FullscreenProvider';
import Mantine8Provider from '../src/providers/Mantine8Provider';
import MantineProvider from '../src/providers/MantineProvider';
import ReactQueryProvider from '../src/providers/ReactQuery/ReactQueryProvider';
import ThirdPartyServicesProvider from '../src/providers/ThirdPartyServicesProvider';
import TrackingProvider from '../src/providers/Tracking/TrackingProvider';

import { ModalsProvider } from '@mantine/modals';
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
    onExplore?: (options: { chart: SavedChart }) => void;
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
    const themeOverride = {
        fontFamily: styles?.fontFamily,
        other: {
            tableFont: styles?.fontFamily,
            chartFont: styles?.fontFamily,
        },
    };

    return (
        <ReactQueryProvider>
            <MantineProvider
                withGlobalStyles
                withNormalizeCSS
                withCSSVariables
                themeOverride={themeOverride}
                notificationsLimit={0}
            >
                <Mantine8Provider themeOverride={themeOverride}>
                    <ModalsProvider>
                        <AppProvider>
                            <FullscreenProvider enabled={false}>
                                <ThirdPartyServicesProvider enabled={false}>
                                    <ErrorBoundary wrapper={{ mt: '4xl' }}>
                                        <MemoryRouter>
                                            <TrackingProvider enabled={true}>
                                                <AbilityProvider>
                                                    <ChartColorMappingContextProvider>
                                                        <ActiveJobProvider>
                                                            {children}
                                                        </ActiveJobProvider>
                                                    </ChartColorMappingContextProvider>
                                                </AbilityProvider>
                                            </TrackingProvider>
                                        </MemoryRouter>
                                    </ErrorBoundary>
                                </ThirdPartyServicesProvider>
                            </FullscreenProvider>
                        </AppProvider>
                    </ModalsProvider>
                </Mantine8Provider>
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
    onExplore,
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
                onExplore={onExplore}
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

const Explore: FC<Props & { exploreId: string; savedChart: SavedChart }> = ({
    token: tokenOrTokenPromise,
    instanceUrl,
    styles,
    filters,
    contentOverrides,
    onExplore,
    exploreId,
    savedChart,
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
                onExplore={onExplore}
            >
                <EmbedExplore
                    exploreId={exploreId}
                    savedChart={savedChart}
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

const Chart: FC<Omit<Props, 'filters' | 'onExplore'> & { id: string }> = ({
    token: tokenOrTokenPromise,
    instanceUrl,
    styles,
    contentOverrides,
    id,
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
                contentOverrides={contentOverrides}
                savedQueryUuid={id}
            >
                <EmbedChart
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

const Lightdash = { Dashboard, Explore, Chart };

// ts-unused-exports:disable-next-line
export { Chart, Dashboard, Explore };
// ts-unused-exports:disable-next-line
export default Lightdash;
