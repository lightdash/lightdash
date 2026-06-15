import '@mantine-8/core/styles.css';
import {
    FilterOperator,
    getErrorMessage,
    type EmbedDashboard as EmbedDashboardType,
    type LanguageMap,
    type SavedChart,
} from '@lightdash/common';
import { ModalsProvider } from '@mantine/modals';
import {
    useEffect,
    useRef,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';
import { MemoryRouter } from 'react-router';
import { type SdkFilter } from '../src/ee/features/embed/EmbedDashboard/types';
import EmbedChart from '../src/ee/pages/EmbedChart';
import EmbedDashboard from '../src/ee/pages/EmbedDashboard';
import EmbedExplore from '../src/ee/pages/EmbedExplore';
import EmbedProvider from '../src/ee/providers/Embed/EmbedProvider';
import useEmbed from '../src/ee/providers/Embed/useEmbed';
import SuboptimalState from '../src/components/common/SuboptimalState/SuboptimalState';
import ErrorBoundary from '../src/features/errorBoundary/ErrorBoundary';
import ChartColorMappingContextProvider from '../src/hooks/useChartColorConfig/ChartColorMappingContextProvider';
import { useCreateMutation } from '../src/hooks/dashboard/useDashboard';
import AbilityProvider from '../src/providers/Ability/AbilityProvider';
import ActiveJobProvider from '../src/providers/ActiveJob/ActiveJobProvider';
import AppProvider from '../src/providers/App/AppProvider';
import FullscreenProvider from '../src/providers/Fullscreen/FullscreenProvider';
import Mantine8Provider from '../src/providers/Mantine8Provider';
import MantineProvider from '../src/providers/MantineProvider';
import ReactQueryProvider from '../src/providers/ReactQuery/ReactQueryProvider';
import ThirdPartyServicesProvider from '../src/providers/ThirdPartyServicesProvider';
import TrackingProvider from '../src/providers/Tracking/TrackingProvider';
import { setToInMemoryStorage } from '../src/utils/inMemoryStorage';
const LIGHTDASH_SDK_INSTANCE_URL_LOCAL_STORAGE_KEY =
    '__lightdash_sdk_instance_url';
const LIGHTDASH_SDK_VERSION_LOCAL_STORAGE_KEY = '__lightdash_sdk_version';

type BaseProps = {
    instanceUrl: string;
    token: Promise<string> | string;
    theme?: 'light' | 'dark';
    styles?: {
        backgroundColor?: string;
        fontFamily?: string;
    };
    filters?: SdkFilter[];
    contentOverrides?: LanguageMap;
    onExplore?: (options: { chart: SavedChart }) => void;
};

type DashboardProps = BaseProps & {
    paletteUuid?: string;
    isEditMode?: boolean;
    onEditModeChange?: (isEditMode: boolean) => void;
};

type DashboardBuilderProps = DashboardProps & {
    onDashboardReady?: (dashboard: EmbedDashboardType) => void;
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

    if (typeof __SDK_VERSION__ !== 'undefined') {
        setToInMemoryStorage(
            LIGHTDASH_SDK_VERSION_LOCAL_STORAGE_KEY,
            __SDK_VERSION__,
        );
    }
};

const useEmbedTokenContext = (
    instanceUrl: string,
    tokenOrTokenPromise: BaseProps['token'],
) => {
    const [tokenContext, setTokenContext] = useState<{
        token: string;
        projectUuid: string;
    } | null>(null);

    useEffect(() => {
        let isMounted = true;

        persistInstanceUrl(instanceUrl);

        const resolveToken = async () =>
            typeof tokenOrTokenPromise === 'string'
                ? tokenOrTokenPromise
                : tokenOrTokenPromise;

        resolveToken()
            .then((tokenToDecode) => {
                const { payload } = decodeJWT(tokenToDecode);

                if (
                    payload &&
                    'content' in payload &&
                    'projectUuid' in payload.content
                ) {
                    if (isMounted) {
                        setTokenContext({
                            token: tokenToDecode,
                            projectUuid: payload.content.projectUuid,
                        });
                    }
                } else {
                    throw new Error('Error decoding token');
                }
            })
            .catch((error) => {
                console.error(error);
                throw new Error('Error retrieving token');
            });

        return () => {
            isMounted = false;
        };
    }, [instanceUrl, tokenOrTokenPromise]);

    return tokenContext;
};

const getDashboardContainerStyles = (
    styles: DashboardProps['styles'],
    theme: DashboardProps['theme'],
) => ({
    width: '100%',
    height: '100%',
    position: 'relative' as const,
    overflow: 'auto',
    backgroundColor:
        styles?.backgroundColor ??
        (theme ? 'var(--mantine-color-body)' : undefined),
});

const SdkProviders: FC<
    PropsWithChildren<{
        styles?: { backgroundColor?: string; fontFamily?: string };
        theme?: 'light' | 'dark';
    }>
> = ({ children, styles, theme }) => {
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
                forceColorScheme={theme}
            >
                <Mantine8Provider
                    themeOverride={themeOverride}
                    forceColorScheme={theme}
                >
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

const Dashboard: FC<DashboardProps> = ({
    token: tokenOrTokenPromise,
    instanceUrl,
    styles,
    theme,
    filters,
    contentOverrides,
    onExplore,
    paletteUuid,
    isEditMode,
    onEditModeChange,
}) => {
    const tokenContext = useEmbedTokenContext(instanceUrl, tokenOrTokenPromise);

    if (!tokenContext) {
        return null;
    }

    return (
        <SdkProviders styles={styles} theme={theme}>
            <EmbedProvider
                embedToken={tokenContext.token}
                projectUuid={tokenContext.projectUuid}
                filters={filters}
                paletteUuid={paletteUuid}
                contentOverrides={contentOverrides}
                onExplore={onExplore}
            >
                <EmbedDashboard
                    containerStyles={getDashboardContainerStyles(styles, theme)}
                    isEditMode={isEditMode}
                    onEditModeChange={onEditModeChange}
                />
            </EmbedProvider>
        </SdkProviders>
    );
};

const dashboardBuilderCreatePromises = new Map<
    string,
    Promise<EmbedDashboardType>
>();

const DashboardBuilderContent: FC<{
    containerStyles?: React.CSSProperties;
    isEditMode?: boolean;
    onEditModeChange?: (isEditMode: boolean) => void;
    onDashboardReady?: (dashboard: EmbedDashboardType) => void;
}> = ({ containerStyles, isEditMode, onEditModeChange, onDashboardReady }) => {
    const { content, embedToken, projectUuid, writeActions } = useEmbed();
    const [dashboard, setDashboard] = useState<EmbedDashboardType>();
    const [createDashboardError, setCreateDashboardError] = useState<
        string | null
    >(null);
    const hasCreatedDashboard = useRef(false);
    const { mutateAsync: createDashboard } = useCreateMutation(
        projectUuid,
        false,
        { showToastOnSuccess: false },
    );

    useEffect(() => {
        if (
            hasCreatedDashboard.current ||
            dashboard ||
            !embedToken ||
            !projectUuid ||
            !writeActions?.spaceUuid
        )
            return;

        hasCreatedDashboard.current = true;
        setCreateDashboardError(null);

        const createKey = `${projectUuid}:${writeActions.spaceUuid}:${
            content?.type === 'dashboard' && 'dashboardUuid' in content
                ? content.dashboardUuid
                : ''
        }`;
        const createPromise =
            dashboardBuilderCreatePromises.get(createKey) ??
            createDashboard({
                name: 'Untitled dashboard',
                description: '',
                spaceUuid: writeActions.spaceUuid,
                tiles: [],
                tabs: [],
            }).then((createdDashboard) => createdDashboard as EmbedDashboardType);

        dashboardBuilderCreatePromises.set(createKey, createPromise);

        createPromise
            .then((createdDashboard) => setDashboard(createdDashboard))
            .catch((error) => {
                console.error(error);
                setCreateDashboardError(getErrorMessage(error));
                hasCreatedDashboard.current = false;
            })
            .finally(() => {
                dashboardBuilderCreatePromises.delete(createKey);
            });
    }, [
        createDashboard,
        content,
        dashboard,
        embedToken,
        projectUuid,
        writeActions?.spaceUuid,
    ]);

    useEffect(() => {
        if (dashboard) {
            onDashboardReady?.(dashboard);
        }
    }, [dashboard, onDashboardReady]);

    if (createDashboardError) {
        return (
            <SuboptimalState
                title="Unable to create dashboard"
                description={createDashboardError}
            />
        );
    }

    if (!dashboard) {
        return null;
    }

    return (
        <EmbedDashboard
            initialDashboard={dashboard}
            containerStyles={containerStyles}
            isEditMode={isEditMode}
            onEditModeChange={onEditModeChange}
        />
    );
};

const DashboardBuilder: FC<DashboardBuilderProps> = ({
    token: tokenOrTokenPromise,
    instanceUrl,
    styles,
    theme,
    filters,
    contentOverrides,
    onExplore,
    paletteUuid,
    isEditMode,
    onEditModeChange,
    onDashboardReady,
}) => {
    const tokenContext = useEmbedTokenContext(instanceUrl, tokenOrTokenPromise);

    if (!tokenContext) {
        return null;
    }

    return (
        <SdkProviders styles={styles} theme={theme}>
            <EmbedProvider
                embedToken={tokenContext.token}
                projectUuid={tokenContext.projectUuid}
                filters={filters}
                paletteUuid={paletteUuid}
                contentOverrides={contentOverrides}
                onExplore={onExplore}
            >
                <DashboardBuilderContent
                    containerStyles={getDashboardContainerStyles(styles, theme)}
                    isEditMode={isEditMode}
                    onEditModeChange={onEditModeChange}
                    onDashboardReady={onDashboardReady}
                />
            </EmbedProvider>
        </SdkProviders>
    );
};

const Explore: FC<BaseProps & { exploreId: string; savedChart: SavedChart }> = ({
    token: tokenOrTokenPromise,
    instanceUrl,
    styles,
    theme,
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
        <SdkProviders styles={styles} theme={theme}>
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
                        backgroundColor:
                            styles?.backgroundColor ??
                            (theme
                                ? 'var(--mantine-color-body)'
                                : undefined),
                    }}
                />
            </EmbedProvider>
        </SdkProviders>
    );
};

const Chart: FC<Omit<BaseProps, 'filters' | 'onExplore'> & { id: string }> = ({
    token: tokenOrTokenPromise,
    instanceUrl,
    styles,
    theme,
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
        <SdkProviders styles={styles} theme={theme}>
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
                        backgroundColor:
                            styles?.backgroundColor ??
                            (theme
                                ? 'var(--mantine-color-body)'
                                : undefined),
                    }}
                />
            </EmbedProvider>
        </SdkProviders>
    );
};

const Lightdash = {
    Dashboard,
    DashboardBuilder,
    Explore,
    Chart,
    FilterOperator,
};

// ts-unused-exports:disable-next-line
export { Chart, Dashboard, DashboardBuilder, Explore, FilterOperator };
// ts-unused-exports:disable-next-line
export default Lightdash;
