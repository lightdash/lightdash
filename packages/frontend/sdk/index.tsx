import '@mantine/core/styles.css';
import '@mantine/code-highlight/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/tiptap/styles.css';
import '../src/styles/global.css';
import './styles/sdk.css';
import {
    FilterOperator,
    getErrorMessage,
    type EmbedDashboard as EmbedDashboardType,
    type LanguageMap,
    type SavedChart,
    type SdkUiOverrides,
    type UiStringKey,
} from '@lightdash/common';
import { Portal, type MantineThemeOverride } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import {
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';
import { createPortal } from 'react-dom';
import { MemoryRouter, Route, Routes } from 'react-router';
import SuboptimalState from '../src/components/common/SuboptimalState/SuboptimalState';
import { type SdkFilter } from '../src/ee/features/embed/EmbedDashboard/types';
import { embedContractClass } from '../src/ee/features/embed/styles/embedClassContract';
import EmbedChart from '../src/ee/pages/EmbedChart';
import EmbedDashboard from '../src/ee/pages/EmbedDashboard';
import EmbedExplore from '../src/ee/pages/EmbedExplore';
import EmbedProvider from '../src/ee/providers/Embed/EmbedProvider';
import {
    type EmbedExploreChart,
    type EmbedExploreOptions,
} from '../src/ee/providers/Embed/types';
import useEmbed from '../src/ee/providers/Embed/useEmbed';
import ErrorBoundary from '../src/features/errorBoundary/ErrorBoundary';
import { type MetricsCatalogFilter } from '../src/features/metricsCatalog/types';
import { useCreateMutation } from '../src/hooks/dashboard/useDashboard';
import ChartColorMappingContextProvider from '../src/hooks/useChartColorConfig/ChartColorMappingContextProvider';
import { useAccount } from '../src/hooks/user/useAccount';
import MetricsCatalogPage from '../src/pages/MetricsCatalog';
import AbilityProvider from '../src/providers/Ability/AbilityProvider';
import ActiveJobProvider from '../src/providers/ActiveJob/ActiveJobProvider';
import AppProvider from '../src/providers/App/AppProvider';
import FullscreenProvider from '../src/providers/Fullscreen/FullscreenProvider';
import MantineProvider from '../src/providers/MantineProvider';
import { PortalTargetContext } from '../src/providers/PortalTarget/PortalTargetContext';
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
import {
    createSdkErrorReporter,
    toSdkError,
    toSdkRequestError,
    type SdkError,
    type SdkErrorHandler,
    type SdkErrorKind,
} from './errors';
import { useLightdashAiAgentThreads, useLightdashContent } from './hooks';
import { SDK_SCOPE_CLASS } from './styles/scope.json';
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
    uiOverrides?: SdkUiOverrides;
    onExplore?: (options: { chart: SavedChart }) => void;
    onError?: SdkErrorHandler;
};

type DashboardProps = BaseProps & {
    paletteUuid?: string;
    isEditMode?: boolean;
    onEditModeChange?: (isEditMode: boolean) => void;
};

type DashboardBuilderProps = DashboardProps & {
    onDashboardReady?: (dashboard: EmbedDashboardType) => void;
};

type ChartProps = Omit<BaseProps, 'filters'> & {
    id: string;
    isEditMode?: boolean;
};

type AiAgentProps = Omit<
    BaseProps,
    'contentOverrides' | 'uiOverrides' | 'filters' | 'onExplore' | 'onError'
> & {
    agentUuid: string;
    onThreadChange?: (options: { threadUuid: string }) => void;
    threadUuid?: string;
};

type MetricsCatalogProps = Omit<
    BaseProps,
    'contentOverrides' | 'uiOverrides' | 'filters' | 'onExplore'
> & {
    hiddenFilters?: MetricsCatalogFilter[];
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
    onError?: SdkErrorHandler,
) => {
    const [tokenContext, setTokenContext] = useState<{
        token: string;
        projectUuid: string;
    } | null>(null);
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    useEffect(() => {
        // Flipped by cleanup on unmount and whenever the token prop changes,
        // so an older token promise resolving late cannot overwrite a newer one.
        let isCurrent = true;

        persistInstanceUrl(instanceUrl);

        Promise.resolve(tokenOrTokenPromise)
            .then((tokenToDecode) => {
                if (!isCurrent) {
                    return;
                }

                const { payload } = decodeJWT(tokenToDecode);

                if (
                    payload &&
                    'content' in payload &&
                    'projectUuid' in payload.content
                ) {
                    setTokenContext({
                        token: tokenToDecode,
                        projectUuid: payload.content.projectUuid,
                    });
                } else {
                    throw new Error('Error decoding token');
                }
            })
            .catch((error) => {
                console.error(error);
                if (isCurrent) {
                    onErrorRef.current?.(
                        toSdkError(error, {
                            fatal: true,
                            kind: 'invalid_token',
                        }),
                    );
                }
            });

        return () => {
            isCurrent = false;
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

type EmbedExploreNavigation = {
    rootKey: string | undefined;
    // Derived chart (drill-down) opened in place
    exploreChart: EmbedExploreChart | undefined;
    // The root Explore's query as it was before its first drill-down
    restoredChart: EmbedExploreChart | undefined;
};

const getInitialNavigation = (
    rootKey: string | undefined,
): EmbedExploreNavigation => ({
    rootKey,
    exploreChart: undefined,
    restoredChart: undefined,
});

// Saved charts go to the host; derived charts (drill-downs) render in place.
// Back leaves every drill-down at once and restores the root's query.
const useEmbedExploreNavigation = (
    onExplore: BaseProps['onExplore'],
    rootKey?: string,
) => {
    const [state, setState] = useState(() => getInitialNavigation(rootKey));
    // A new root chart from the host starts a fresh navigation
    const navigation =
        state.rootKey === rootKey ? state : getInitialNavigation(rootKey);
    if (navigation !== state) {
        setState(navigation);
    }

    const handleExplore = useCallback(
        ({ chart, sourceChart }: EmbedExploreOptions) => {
            if ('uuid' in chart) {
                onExplore?.({ chart });
                return;
            }
            setState((prev) => ({
                ...prev,
                exploreChart: chart,
                // Nested drill-downs keep the root's query
                restoredChart: prev.exploreChart
                    ? prev.restoredChart
                    : (sourceChart ?? prev.restoredChart),
            }));
        },
        [onExplore],
    );

    const handleBackToDashboard = useCallback(
        () => setState((prev) => ({ ...prev, exploreChart: undefined })),
        [],
    );

    return {
        exploreChart: navigation.exploreChart,
        restoredChart: navigation.restoredChart,
        handleExplore,
        handleBackToDashboard,
    };
};

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

// Distinguishes this copy of the bundle from another one on the same page, so
// instance ids never collide.
const SDK_BUNDLE_ID = Math.random().toString(36).slice(2, 8);

const SdkProviders: FC<
    PropsWithChildren<{
        styles?: { backgroundColor?: string; fontFamily?: string };
        theme?: 'light' | 'dark';
        projectUuid?: string;
        onError?: SdkErrorHandler;
    }>
> = ({ children, styles, theme, projectUuid, onError }) => {
    const colorScheme = theme ?? 'light';
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;
    const [reportError] = useState(() =>
        createSdkErrorReporter(() => onErrorRef.current),
    );
    const rootRef = useRef<HTMLDivElement>(null);
    const getRootElement = useCallback(() => rootRef.current ?? undefined, []);
    // Each mounted component gets its own class for Mantine's CSS variables,
    // so two embeds with different fonts or themes on one page don't fight
    // over shared variables. The scope class stays shared: the build-time
    // scoped stylesheets key on it.
    const instanceId = `${SDK_BUNDLE_ID}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const instanceClass = `lightdash-sdk-instance-${instanceId}`;
    // Body-level container for everything that portals out of the inline root
    // (dropdowns, modals, drag overlays), so it escapes the host's overflow and
    // stacking contexts while keeping the SDK's variables and colour scheme.
    // Mantine resolves a selector target in its layout effect, by which time
    // the container below is in the DOM, so no render round-trip.
    const portalId = `lightdash-sdk-portal-${instanceId}`;
    const fontFamily = styles?.fontFamily;
    // Only override the font when the consumer sets one: Mantine 8's CSS-vars
    // generator stringifies an explicit undefined into `font-family: undefined`.
    const themeOverride = useMemo<MantineThemeOverride>(
        () => ({
            ...(fontFamily
                ? {
                      fontFamily,
                      other: { tableFont: fontFamily, chartFont: fontFamily },
                  }
                : {}),
            components: {
                Portal: Portal.extend({
                    defaultProps: { target: `#${portalId}` },
                }),
            },
        }),
        [fontFamily, portalId],
    );
    const route = projectUuid ? `/projects/${projectUuid}` : '/';
    const routedChildren = projectUuid ? (
        <Routes>
            <Route path="/projects/:projectUuid/*" element={<>{children}</>} />
        </Routes>
    ) : (
        children
    );

    return (
        <>
            {createPortal(
                <div
                    id={portalId}
                    className={embedContractClass(
                        'ld-sdk-portal',
                        SDK_SCOPE_CLASS,
                        instanceClass,
                    )}
                    data-mantine-color-scheme={colorScheme}
                />,
                document.body,
            )}
            <ReactQueryProvider
                onError={(error, key) =>
                    reportError(toSdkRequestError(error, key))
                }
            >
                <MantineProvider
                    themeOverride={themeOverride}
                    notificationsLimit={0}
                    forceColorScheme={colorScheme}
                    cssVariablesSelector={`.${instanceClass}`}
                    getRootElement={getRootElement}
                    syncBodyColorMode={false}
                >
                    <div
                        ref={rootRef}
                        className={embedContractClass(
                            'ld-sdk-root',
                            SDK_SCOPE_CLASS,
                            instanceClass,
                        )}
                    >
                        <PortalTargetContext.Provider value={`#${portalId}`}>
                            <ModalsProvider>
                                <AppProvider>
                                    <FullscreenProvider enabled={false}>
                                        <ThirdPartyServicesProvider
                                            enabled={false}
                                        >
                                            <ErrorBoundary
                                                wrapper={{ mt: '4xl' }}
                                                onError={(error) =>
                                                    reportError(
                                                        toSdkError(error, {
                                                            fatal: true,
                                                            kind: 'render',
                                                        }),
                                                    )
                                                }
                                            >
                                                <MemoryRouter
                                                    initialEntries={[route]}
                                                >
                                                    <TrackingProvider
                                                        enabled={true}
                                                    >
                                                        <AbilityProvider>
                                                            <ChartColorMappingContextProvider>
                                                                <ActiveJobProvider>
                                                                    {
                                                                        routedChildren
                                                                    }
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
                        </PortalTargetContext.Provider>
                    </div>
                </MantineProvider>
            </ReactQueryProvider>
        </>
    );
};

const Dashboard: FC<DashboardProps> = ({
    token: tokenOrTokenPromise,
    instanceUrl,
    styles,
    theme,
    filters,
    contentOverrides,
    uiOverrides,
    onExplore,
    onError,
    paletteUuid,
    isEditMode,
    onEditModeChange,
}) => {
    const tokenContext = useEmbedTokenContext(
        instanceUrl,
        tokenOrTokenPromise,
        onError,
    );
    const { exploreChart, handleExplore, handleBackToDashboard } =
        useEmbedExploreNavigation(onExplore);

    if (!tokenContext) {
        return null;
    }

    return (
        <SdkProviders
            projectUuid={tokenContext.projectUuid}
            styles={styles}
            theme={theme}
            onError={onError}
        >
            <EmbedProvider
                embedToken={tokenContext.token}
                projectUuid={tokenContext.projectUuid}
                filters={filters}
                paletteUuid={paletteUuid}
                contentOverrides={contentOverrides}
                uiOverrides={uiOverrides}
                onExplore={handleExplore}
                onBackToDashboard={handleBackToDashboard}
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
                    <EmbedDashboard
                        containerStyles={getDashboardContainerStyles(
                            styles,
                            theme,
                        )}
                        isEditMode={isEditMode}
                        onEditModeChange={onEditModeChange}
                    />
                )}
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
    uiOverrides,
    onExplore,
    onError,
    paletteUuid,
    isEditMode,
    onEditModeChange,
    onDashboardReady,
}) => {
    const tokenContext = useEmbedTokenContext(
        instanceUrl,
        tokenOrTokenPromise,
        onError,
    );
    const { exploreChart, handleExplore, handleBackToDashboard } =
        useEmbedExploreNavigation(onExplore);

    if (!tokenContext) {
        return null;
    }

    return (
        <SdkProviders
            projectUuid={tokenContext.projectUuid}
            styles={styles}
            theme={theme}
            onError={onError}
        >
            <EmbedProvider
                embedToken={tokenContext.token}
                projectUuid={tokenContext.projectUuid}
                filters={filters}
                paletteUuid={paletteUuid}
                contentOverrides={contentOverrides}
                uiOverrides={uiOverrides}
                onExplore={handleExplore}
                onBackToDashboard={handleBackToDashboard}
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
                    <DashboardBuilderContent
                        containerStyles={getDashboardContainerStyles(
                            styles,
                            theme,
                        )}
                        isEditMode={isEditMode}
                        onEditModeChange={onEditModeChange}
                        onDashboardReady={onDashboardReady}
                    />
                )}
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
    uiOverrides,
    onExplore,
    onError,
    exploreId,
    savedChart,
}) => {
    const tokenContext = useEmbedTokenContext(
        instanceUrl,
        tokenOrTokenPromise,
        onError,
    );
    const {
        exploreChart,
        restoredChart,
        handleExplore,
        handleBackToDashboard,
    } = useEmbedExploreNavigation(onExplore, `${exploreId}:${savedChart.uuid}`);
    const currentChart = exploreChart ?? restoredChart;

    if (!tokenContext) {
        return null;
    }

    return (
        <SdkProviders
            projectUuid={tokenContext.projectUuid}
            styles={styles}
            theme={theme}
            onError={onError}
        >
            <EmbedProvider
                embedToken={tokenContext.token}
                projectUuid={tokenContext.projectUuid}
                filters={filters}
                contentOverrides={contentOverrides}
                uiOverrides={uiOverrides}
                onExplore={handleExplore}
                onBackToDashboard={
                    exploreChart ? handleBackToDashboard : undefined
                }
                backDestination="explore"
            >
                <EmbedExplore
                    exploreId={currentChart?.tableName ?? exploreId}
                    savedChart={currentChart ?? savedChart}
                    runQueryOnLoad={
                        exploreChart === undefined &&
                        restoredChart !== undefined
                    }
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

const EditableChartContent: FC<{
    containerStyles: React.CSSProperties;
    isEditMode: boolean;
}> = ({ containerStyles, isEditMode }) => {
    const { embedWriteContext } = useEmbed();
    const account = useAccount();

    if (account.isLoading) {
        return null;
    }

    if (embedWriteContext?.canUpdateSavedChart === true) {
        return (
            <EmbedExplore
                containerStyles={containerStyles}
                allowChartUpdate
                isEditMode={isEditMode}
                chartView
            />
        );
    }

    if (isEditMode) {
        return (
            <SuboptimalState
                title="Unable to edit chart"
                description="The embed write actor does not have permission to update this chart in the configured write space."
            />
        );
    }

    return <EmbedChart containerStyles={containerStyles} />;
};

const ChartContent: FC<{
    containerStyles: React.CSSProperties;
    isEditMode?: boolean;
}> = ({ containerStyles, isEditMode }) => {
    // Omitting isEditMode preserves the legacy Chart renderer exactly. Passing
    // an explicit boolean opts into the mounted view/edit explorer surface.
    if (isEditMode === undefined) {
        return <EmbedChart containerStyles={containerStyles} />;
    }

    return (
        <EditableChartContent
            containerStyles={containerStyles}
            isEditMode={isEditMode}
        />
    );
};

const Chart: FC<ChartProps> = ({
    token: tokenOrTokenPromise,
    instanceUrl,
    styles,
    theme,
    contentOverrides,
    uiOverrides,
    onExplore,
    onError,
    id,
    isEditMode,
}) => {
    const tokenContext = useEmbedTokenContext(
        instanceUrl,
        tokenOrTokenPromise,
        onError,
    );
    const { exploreChart, handleExplore, handleBackToDashboard } =
        useEmbedExploreNavigation(onExplore);

    if (!tokenContext) {
        return null;
    }

    const containerStyles = {
        width: '100%',
        height: '100%',
        position: 'relative' as const,
        overflow: 'auto',
        backgroundColor:
            styles?.backgroundColor ??
            (theme ? 'var(--mantine-color-body)' : undefined),
    };

    return (
        <SdkProviders
            projectUuid={tokenContext.projectUuid}
            styles={styles}
            theme={theme}
            onError={onError}
        >
            <EmbedProvider
                embedToken={tokenContext.token}
                projectUuid={tokenContext.projectUuid}
                contentOverrides={contentOverrides}
                uiOverrides={uiOverrides}
                savedQueryUuid={id}
                onExplore={handleExplore}
                onBackToDashboard={
                    exploreChart ? handleBackToDashboard : undefined
                }
            >
                {exploreChart ? (
                    <EmbedExplore
                        exploreId={exploreChart.tableName}
                        savedChart={exploreChart}
                        containerStyles={containerStyles}
                    />
                ) : (
                    <ChartContent
                        containerStyles={containerStyles}
                        isEditMode={isEditMode}
                    />
                )}
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
            title="AI agent"
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
    hiddenFilters,
    onError,
}) => {
    const tokenContext = useEmbedTokenContext(
        instanceUrl,
        tokenOrTokenPromise,
        onError,
    );
    const [exploreChart, setExploreChart] = useState<EmbedExploreChart>();

    if (!tokenContext) {
        return null;
    }

    return (
        <SdkProviders
            projectUuid={tokenContext.projectUuid}
            styles={styles}
            theme={theme}
            onError={onError}
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
                        <MetricsCatalogPage hiddenFilters={hiddenFilters} />
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
    MetricsCatalogFilter,
    SdkError,
    SdkErrorKind,
    SdkUiOverrides,
    UiStringKey,
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
