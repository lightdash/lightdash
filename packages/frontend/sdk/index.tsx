import '@mantine-8/core/styles.css';
import '@mantine-8/code-highlight/styles.css';
import '@mantine-8/tiptap/styles.css';
import '../src/styles/global.css';
import {
    FilterOperator,
    getErrorMessage,
    type EmbedDashboard as EmbedDashboardType,
    type LanguageMap,
    type SavedChart,
} from '@lightdash/common';
import { ModalsProvider } from '@mantine-8/modals';
import {
    useEffect,
    useRef,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import SuboptimalState from '../src/components/common/SuboptimalState/SuboptimalState';
import { type SdkFilter } from '../src/ee/features/embed/EmbedDashboard/types';
import EmbedChart from '../src/ee/pages/EmbedChart';
import EmbedDashboard from '../src/ee/pages/EmbedDashboard';
import EmbedExplore from '../src/ee/pages/EmbedExplore';
import EmbedProvider from '../src/ee/providers/Embed/EmbedProvider';
import { type EmbedExploreChart } from '../src/ee/providers/Embed/types';
import useEmbed from '../src/ee/providers/Embed/useEmbed';
import ErrorBoundary from '../src/features/errorBoundary/ErrorBoundary';
import { useCreateMutation } from '../src/hooks/dashboard/useDashboard';
import ChartColorMappingContextProvider from '../src/hooks/useChartColorConfig/ChartColorMappingContextProvider';
import MetricsCatalogPage from '../src/pages/MetricsCatalog';
import AbilityProvider from '../src/providers/Ability/AbilityProvider';
import ActiveJobProvider from '../src/providers/ActiveJob/ActiveJobProvider';
import AppProvider from '../src/providers/App/AppProvider';
import FullscreenProvider from '../src/providers/Fullscreen/FullscreenProvider';
import MantineProvider from '../src/providers/MantineProvider';
import ReactQueryProvider from '../src/providers/ReactQuery/ReactQueryProvider';
import ThirdPartyServicesProvider from '../src/providers/ThirdPartyServicesProvider';
import TrackingProvider from '../src/providers/Tracking/TrackingProvider';
import { setToInMemoryStorage } from '../src/utils/inMemoryStorage';
import {
    createLightdashApiClient,
    type LightdashAiAgentThread,
    type LightdashAiAgentThreadResults,
    type LightdashApiClientConfig,
    type LightdashContentItem,
    type LightdashContentResults,
    type LightdashSdkApiAuth,
    type ListAiAgentThreadsOptions,
    type ListContentOptions,
} from './api';
import { useLightdashAiAgentThreads, useLightdashContent } from './hooks';
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

type AiAgentProps = Omit<
    BaseProps,
    'contentOverrides' | 'filters' | 'onExplore'
> & {
    agentUuid: string;
    onThreadChange?: (options: { threadUuid: string }) => void;
    threadUuid?: string;
};

type MetricsCatalogProps = Omit<
    BaseProps,
    'contentOverrides' | 'filters' | 'onExplore'
>;

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

const getSavedChartExploreHandler = (onExplore: BaseProps['onExplore']) =>
    onExplore
        ? ({ chart }: { chart: EmbedExploreChart }) => {
              if ('uuid' in chart) {
                  onExplore({ chart });
              }
          }
        : undefined;

const getAiAgentEmbedUrl = ({
    agentUuid,
    instanceUrl,
    projectUuid,
    targetOrigin,
    theme,
    threadUuid,
    token,
}: {
    agentUuid: string;
    instanceUrl: string;
    projectUuid: string;
    targetOrigin?: string;
    theme: AiAgentProps['theme'];
    threadUuid?: string;
    token: string;
}) => {
    const normalizedInstanceUrl = instanceUrl.endsWith('/')
        ? instanceUrl
        : `${instanceUrl}/`;
    const path = threadUuid
        ? `embed/${projectUuid}/ai-agents/${agentUuid}/threads/${threadUuid}`
        : `embed/${projectUuid}/ai-agents/${agentUuid}/threads`;
    const url = new URL(path, normalizedInstanceUrl);

    if (theme) {
        url.searchParams.set('theme', theme);
    }
    if (targetOrigin) {
        url.searchParams.set('targetOrigin', targetOrigin);
    }

    url.hash = token;
    return url.toString();
};

const AI_AGENT_THREAD_CHANGED_EVENT = 'lightdash:aiAgentThreadChanged';

type AiAgentThreadChangedMessage = {
    type: typeof AI_AGENT_THREAD_CHANGED_EVENT;
    payload: {
        agentUuid: string;
        projectUuid: string;
        threadUuid: string;
    };
};

const isAiAgentThreadChangedMessage = (
    data: unknown,
): data is AiAgentThreadChangedMessage =>
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    data.type === AI_AGENT_THREAD_CHANGED_EVENT &&
    'payload' in data &&
    typeof data.payload === 'object' &&
    data.payload !== null &&
    'agentUuid' in data.payload &&
    typeof data.payload.agentUuid === 'string' &&
    'projectUuid' in data.payload &&
    typeof data.payload.projectUuid === 'string' &&
    'threadUuid' in data.payload &&
    typeof data.payload.threadUuid === 'string';

const SdkProviders: FC<
    PropsWithChildren<{
        styles?: { backgroundColor?: string; fontFamily?: string };
        theme?: 'light' | 'dark';
        projectUuid?: string;
    }>
> = ({ children, styles, theme, projectUuid }) => {
    const themeOverride = {
        fontFamily: styles?.fontFamily,
        other: {
            tableFont: styles?.fontFamily,
            chartFont: styles?.fontFamily,
        },
    };
    const route = projectUuid ? `/projects/${projectUuid}` : '/';
    const routedChildren = projectUuid ? (
        <Routes>
            <Route path="/projects/:projectUuid/*" element={<>{children}</>} />
        </Routes>
    ) : (
        children
    );

    return (
        <ReactQueryProvider>
            <MantineProvider
                themeOverride={themeOverride}
                notificationsLimit={0}
                forceColorScheme={theme}
            >
                <ModalsProvider>
                    <AppProvider>
                        <FullscreenProvider enabled={false}>
                            <ThirdPartyServicesProvider enabled={false}>
                                <ErrorBoundary wrapper={{ mt: '4xl' }}>
                                    <MemoryRouter initialEntries={[route]}>
                                        <TrackingProvider enabled={true}>
                                            <AbilityProvider>
                                                <ChartColorMappingContextProvider>
                                                    <ActiveJobProvider>
                                                        {routedChildren}
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
        <SdkProviders
            projectUuid={tokenContext.projectUuid}
            styles={styles}
            theme={theme}
        >
            <EmbedProvider
                embedToken={tokenContext.token}
                projectUuid={tokenContext.projectUuid}
                filters={filters}
                paletteUuid={paletteUuid}
                contentOverrides={contentOverrides}
                onExplore={getSavedChartExploreHandler(onExplore)}
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
            }).then(
                (createdDashboard) => createdDashboard as EmbedDashboardType,
            );

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
        <SdkProviders
            projectUuid={tokenContext.projectUuid}
            styles={styles}
            theme={theme}
        >
            <EmbedProvider
                embedToken={tokenContext.token}
                projectUuid={tokenContext.projectUuid}
                filters={filters}
                paletteUuid={paletteUuid}
                contentOverrides={contentOverrides}
                onExplore={getSavedChartExploreHandler(onExplore)}
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

const Explore: FC<
    BaseProps & { exploreId: string; savedChart: SavedChart }
> = ({
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
        <SdkProviders projectUuid={projectUuid} styles={styles} theme={theme}>
            <EmbedProvider
                embedToken={token}
                projectUuid={projectUuid}
                filters={filters}
                contentOverrides={contentOverrides}
                onExplore={getSavedChartExploreHandler(onExplore)}
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
                            (theme ? 'var(--mantine-color-body)' : undefined),
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
        <SdkProviders projectUuid={projectUuid} styles={styles} theme={theme}>
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
                            (theme ? 'var(--mantine-color-body)' : undefined),
                    }}
                />
            </EmbedProvider>
        </SdkProviders>
    );
};

const AiAgent: FC<AiAgentProps> = ({
    agentUuid,
    instanceUrl,
    onThreadChange,
    styles,
    theme,
    threadUuid,
    token: tokenOrTokenPromise,
}) => {
    const tokenContext = useEmbedTokenContext(instanceUrl, tokenOrTokenPromise);
    const instanceOrigin = new URL(instanceUrl).origin;
    const targetOrigin =
        typeof window !== 'undefined' && onThreadChange
            ? window.location.origin
            : undefined;

    useEffect(() => {
        if (!tokenContext || !onThreadChange) {
            return undefined;
        }

        const handleMessage = (event: MessageEvent) => {
            if (event.origin !== instanceOrigin) {
                return;
            }
            if (!isAiAgentThreadChangedMessage(event.data)) {
                return;
            }
            if (
                event.data.payload.projectUuid !== tokenContext.projectUuid ||
                event.data.payload.agentUuid !== agentUuid
            ) {
                return;
            }

            onThreadChange({ threadUuid: event.data.payload.threadUuid });
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [agentUuid, instanceOrigin, onThreadChange, tokenContext]);

    if (!tokenContext) {
        return null;
    }

    return (
        <iframe
            title="Lightdash AI agent"
            src={getAiAgentEmbedUrl({
                agentUuid,
                instanceUrl,
                projectUuid: tokenContext.projectUuid,
                targetOrigin,
                theme,
                threadUuid,
                token: tokenContext.token,
            })}
            style={{
                width: '100%',
                height: '100%',
                border: 0,
                backgroundColor:
                    styles?.backgroundColor ??
                    (theme ? 'var(--mantine-color-body)' : undefined),
            }}
        />
    );
};

const MetricsCatalog: FC<MetricsCatalogProps> = ({
    instanceUrl,
    styles,
    theme,
    token: tokenOrTokenPromise,
}) => {
    const tokenContext = useEmbedTokenContext(instanceUrl, tokenOrTokenPromise);
    const [exploreChart, setExploreChart] = useState<EmbedExploreChart>();

    if (!tokenContext) {
        return null;
    }

    return (
        <SdkProviders
            projectUuid={tokenContext.projectUuid}
            styles={styles}
            theme={theme}
        >
            <EmbedProvider
                embedToken={tokenContext.token}
                projectUuid={tokenContext.projectUuid}
                onExplore={({ chart }) => setExploreChart(chart)}
                onBackToDashboard={() => setExploreChart(undefined)}
            >
                {exploreChart ? (
                    <EmbedExplore
                        exploreId={exploreChart.tableName}
                        savedChart={exploreChart}
                        containerStyles={getDashboardContainerStyles(
                            styles,
                            theme,
                        )}
                    />
                ) : (
                    <div
                        style={{
                            ...getDashboardContainerStyles(styles, theme),
                            overflow: 'hidden',
                        }}
                    >
                        <MetricsCatalogPage />
                    </div>
                )}
            </EmbedProvider>
        </SdkProviders>
    );
};

const Lightdash = {
    AiAgent,
    Dashboard,
    DashboardBuilder,
    MetricsCatalog,
    Explore,
    Chart,
    FilterOperator,
    createLightdashApiClient,
    useLightdashAiAgentThreads,
    useLightdashContent,
};

// ts-unused-exports:disable-next-line
export {
    AiAgent,
    Chart,
    Dashboard,
    DashboardBuilder,
    Explore,
    MetricsCatalog,
    FilterOperator,
    createLightdashApiClient,
    useLightdashAiAgentThreads,
    useLightdashContent,
};
export type {
    LightdashAiAgentThread,
    LightdashAiAgentThreadResults,
    LightdashApiClientConfig,
    LightdashContentItem,
    LightdashContentResults,
    LightdashSdkApiAuth,
    ListAiAgentThreadsOptions,
    ListContentOptions,
};
// ts-unused-exports:disable-next-line
export default Lightdash;
