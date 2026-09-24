import { getFieldQuoteChar } from '@lightdash/common';
import { Stack } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { Provider } from 'react-redux';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useMount, useUnmount } from 'react-use';
import ErrorState from '../components/common/ErrorState';
import Page from '../components/common/Page/Page';
import {
    resetChartState,
    setChartConfig,
} from '../components/DataViz/store/actions/commonChartActions';
import { SqlRunnerSidebar } from '../features/sqlRunner';
import { ContentPanel } from '../features/sqlRunner/components/ContentPanel';
import { Header } from '../features/sqlRunner/components/Header';
import { useSavedSqlChart } from '../features/sqlRunner/hooks/useSavedSqlCharts';
import { useSqlRunnerShareUrl } from '../features/sqlRunner/hooks/useSqlRunnerShareUrl';
import { SqlRunnerConnectionScope } from '../features/sqlRunner/multiConnection/components/SqlRunnerConnectionScope';
import { useSqlRunnerConnections } from '../features/sqlRunner/multiConnection/hooks/useConnectionCatalog';
import { store } from '../features/sqlRunner/store';
import {
    useAppDispatch,
    useAppSelector,
} from '../features/sqlRunner/store/hooks';
import {
    resetState,
    setFetchResultsOnLoad,
    setMode,
    setParameterValues,
    setProjectUuid,
    setQuoteChar,
    setSavedChartData,
    setSql,
    setSqlLimit,
    setState,
    setWarehouseConnectionType,
} from '../features/sqlRunner/store/sqlRunnerSlice';
import { HeaderVirtualView } from '../features/virtualView';
import { type VirtualViewState } from '../features/virtualView/components/HeaderVirtualView';
import useToaster from '../hooks/toaster/useToaster';
import { useProject } from '../hooks/useProject';
import { useProjectUuid } from '../hooks/useProjectUuid';
import useSearchParams from '../hooks/useSearchParams';

const SqlRunner = ({
    isEditMode,
    virtualViewState,
}: {
    isEditMode?: boolean;
    virtualViewState?: VirtualViewState;
}) => {
    const dispatch = useAppDispatch();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const mode = useAppSelector((state) => state.sqlRunner.mode);
    const warehouseConnectionType = useAppSelector(
        (state) => state.sqlRunner.warehouseConnectionType,
    );

    const routeProjectUuid = useProjectUuid();
    const params = useParams<{ slug?: string }>();
    const share = useSearchParams('share');
    const shareState = useSqlRunnerShareUrl(share || undefined);

    const location = useLocation();
    const navigate = useNavigate();
    const [connectionHint] = useState<string | null | undefined>(() => {
        const hint = location.state?.warehouseConnectionUuid;
        return typeof hint === 'string' || hint === null ? hint : undefined;
    });

    const { data: project } = useProject(projectUuid);
    const { data: shareConnections, error: shareConnectionsError } =
        useSqlRunnerConnections(
            projectUuid,
            !!share && project?.connectionRoute === 'multi',
        );
    const { showToastError } = useToaster();
    const appliedShareId = useRef<string | null>(null);

    useEffect(() => {
        if (shareState.error) {
            showToastError({
                title: `Unable to load shared SQL runner state`,
                subtitle: shareState.error.message,
            });
            return;
        }
        if (
            share &&
            shareState.sqlRunnerState &&
            project &&
            appliedShareId.current !== share
        ) {
            if (
                project.connectionRoute === 'multi' &&
                !shareConnections &&
                !shareConnectionsError
            )
                return;
            const routesSingle =
                project.connectionRoute !== 'multi' ||
                shareConnectionsError?.error.name ===
                    'SingleConnectionProjectError';
            const hintedConnectionExists = shareConnections?.some(
                (connection) =>
                    shareState.warehouseConnectionUuid === null
                        ? connection.isOriginal
                        : connection.warehouseConnectionUuid ===
                          shareState.warehouseConnectionUuid,
            );
            appliedShareId.current = share;
            dispatch(
                setState({
                    ...shareState.sqlRunnerState,
                    connectionRoute: store.getState().sqlRunner.connectionRoute,
                    fetchResultsOnLoad:
                        routesSingle || hintedConnectionExists === true,
                }),
            );
            if (shareState.chartConfig) {
                dispatch(setChartConfig(shareState.chartConfig));
            }
        }
    }, [
        share,
        shareState,
        project,
        shareConnections,
        shareConnectionsError,
        dispatch,
        showToastError,
    ]);
    useUnmount(() => {
        dispatch(resetState());
        dispatch(resetChartState());
    });

    useMount(() => {
        const shouldFetch = !!isEditMode || !!virtualViewState;
        // If we are editing a virtual view, we don't want to open the chart on load
        const shouldOpenChartOnLoad = !!isEditMode && !virtualViewState;

        if (shouldFetch) {
            dispatch(
                setFetchResultsOnLoad({
                    shouldFetch,
                    shouldOpenChartOnLoad,
                }),
            );
        }
        if (virtualViewState) {
            // remove wrapping parenthesis if they exist
            const sql = virtualViewState.sql.replace(/^[()]+|[()]+$/g, '');
            dispatch(setSql(sql));
            dispatch(setMode('virtualView'));
            // Restore saved parameter values when editing a virtual view
            if (virtualViewState.savedParameterValues) {
                dispatch(
                    setParameterValues(virtualViewState.savedParameterValues),
                );
            }
        }
    });

    useEffect(() => {
        if (!projectUuid && routeProjectUuid) {
            dispatch(setProjectUuid(routeProjectUuid));
        }
    }, [dispatch, routeProjectUuid, projectUuid]);

    // Use the SQL string from the location state if available
    useEffect(() => {
        if (location.state?.sql) {
            dispatch(setSql(location.state.sql));
            if (typeof location.state.limit === 'number') {
                dispatch(setSqlLimit(location.state.limit));
            }
            // clear the location state - this prevents state from being preserved on page refresh
            void navigate({ ...location }, { replace: true, state: undefined });
        }
    }, [dispatch, location, navigate]);

    const { data, error: chartError } = useSavedSqlChart({
        projectUuid,
        slug: params.slug,
    });

    useEffect(() => {
        if (data) {
            dispatch(setSavedChartData(data));
            dispatch(setChartConfig(data.config));
        }
    }, [dispatch, data]);

    // Share links replace the whole slice via `setState`, dropping this
    // project-derived field; re-restore it whenever the store value is missing.
    const warehouseType = project?.warehouseConnection?.type;
    useEffect(() => {
        if (warehouseType && !warehouseConnectionType) {
            dispatch(setWarehouseConnectionType(warehouseType));
            dispatch(setQuoteChar(getFieldQuoteChar(warehouseType)));
        }
    }, [dispatch, warehouseType, warehouseConnectionType]);

    if (chartError) {
        return <ErrorState error={chartError.error} />;
    }

    return (
        <SqlRunnerConnectionScope
            isEditingSavedChart={!!params.slug}
            connectionHint={connectionHint}
            isSharedLink={!!share}
            sharedConnectionUuid={shareState.warehouseConnectionUuid}
        >
            <Page
                title="SQL Runner"
                noContentPadding
                flexContent
                sidebar={<SqlRunnerSidebar />}
                sidebarTitle="Tables"
            >
                <Stack gap={0} flex={1} miw={0}>
                    {mode === 'virtualView' && virtualViewState ? (
                        <HeaderVirtualView
                            virtualViewState={virtualViewState}
                        />
                    ) : (
                        <Header mode={params.slug ? 'edit' : 'create'} />
                    )}
                    <ContentPanel />
                </Stack>
            </Page>
        </SqlRunnerConnectionScope>
    );
};

const SqlRunnerNewPage = ({
    isEditMode,
    virtualViewState,
}: {
    isEditMode?: boolean;
    virtualViewState?: VirtualViewState;
}) => {
    return (
        <Provider store={store}>
            <SqlRunner
                isEditMode={isEditMode}
                virtualViewState={virtualViewState}
            />
        </Provider>
    );
};

export default SqlRunnerNewPage;
