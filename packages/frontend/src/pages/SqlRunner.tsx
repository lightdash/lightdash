import { getFieldQuoteChar } from '@lightdash/common';
import { Stack } from '@mantine/core';
import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useMount, useUnmount } from 'react-use';
import ErrorState from '../components/common/ErrorState';
import Page from '../components/common/Page/Page';
import {
    resetChartState,
    setChartConfig,
} from '../components/DataViz/store/actions/commonChartActions';
import { Sidebar } from '../features/sqlRunner';
import { ContentPanel } from '../features/sqlRunner/components/ContentPanel';
import { Header } from '../features/sqlRunner/components/Header';
import { useSavedSqlChart } from '../features/sqlRunner/hooks/useSavedSqlCharts';
import { useSqlRunnerShareUrl } from '../features/sqlRunner/hooks/useSqlRunnerShareUrl';
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
    setConnectionUuid,
    setProjectUuid,
    setQuoteChar,
    setSavedChartData,
    setSql,
    setSqlLimit,
    setState,
    setWarehouseConnectionType,
} from '../features/sqlRunner/store/sqlRunnerSlice';
import {
    readLastUsedConnection,
    resolveActiveConnection,
} from '../features/sqlRunner/utils/activeConnection';
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

    const { data: project } = useProject(projectUuid);
    const { showToastError } = useToaster();

    useEffect(() => {
        if (shareState.error) {
            showToastError({
                title: `Unable to load shared SQL runner state`,
                subtitle: shareState.error.message,
            });
            return;
        }
        if (shareState.sqlRunnerState) {
            dispatch(
                setState({
                    ...shareState.sqlRunnerState,
                    fetchResultsOnLoad: true,
                }),
            );
            if (shareState.chartConfig) {
                dispatch(setChartConfig(shareState.chartConfig));
            }
        }
    }, [shareState, dispatch, showToastError]);
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

    // A new document opens on the last connection used in this project; a saved
    // chart opens on the connection stored with its version.
    const connectionUuid = useAppSelector(
        (state) => state.sqlRunner.connectionUuid,
    );
    const savedSqlChart = useAppSelector(
        (state) => state.sqlRunner.savedSqlChart,
    );
    const isSavedChart = !!params.slug;
    const connections = project?.connections;
    useEffect(() => {
        if (connectionUuid || !connections) return;
        if (isSavedChart && !savedSqlChart) return;
        const resolved = resolveActiveConnection({
            connections,
            savedConnectionUuid: savedSqlChart?.connectionUuid ?? undefined,
            lastUsedConnectionUuid: projectUuid
                ? readLastUsedConnection(projectUuid)
                : undefined,
            isSavedChart,
        });
        if (resolved) dispatch(setConnectionUuid(resolved));
    }, [
        dispatch,
        connectionUuid,
        connections,
        savedSqlChart,
        isSavedChart,
        projectUuid,
    ]);

    // The editor dialect follows the selected connection. A project's first
    // connection can disagree with the one a saved chart runs on, so it is
    // only used when the project has no choice to make.
    const selectedConnection = connections?.find(
        (connection) => connection.connectionUuid === connectionUuid,
    );
    const warehouseType =
        selectedConnection?.warehouseType ??
        (connections?.length === 1
            ? connections[0]?.warehouseType
            : undefined) ??
        project?.warehouseConnection?.type;
    useEffect(() => {
        if (!warehouseType || warehouseType === warehouseConnectionType) return;
        dispatch(setWarehouseConnectionType(warehouseType));
        dispatch(setQuoteChar(getFieldQuoteChar(warehouseType)));
    }, [dispatch, warehouseType, warehouseConnectionType]);

    if (chartError) {
        return <ErrorState error={chartError.error} />;
    }

    return (
        <Page
            title="SQL Runner"
            noContentPadding
            flexContent
            sidebar={<Sidebar />}
            sidebarTitle="Tables"
        >
            <Stack gap={0} flex={1} miw={0}>
                {mode === 'virtualView' && virtualViewState ? (
                    <HeaderVirtualView virtualViewState={virtualViewState} />
                ) : (
                    <Header mode={params.slug ? 'edit' : 'create'} />
                )}
                <ContentPanel />
            </Stack>
        </Page>
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
