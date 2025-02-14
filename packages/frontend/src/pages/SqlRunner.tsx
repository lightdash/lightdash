import { getFieldQuoteChar } from '@lightdash/common';
import { ActionIcon, Group, Paper, Stack, Tooltip } from '@mantine/core';
import { IconLayoutSidebarLeftExpand } from '@tabler/icons-react';
import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useMount, useUnmount } from 'react-use';
import {
    resetChartState,
    setChartConfig,
} from '../components/DataViz/store/actions/commonChartActions';
import ErrorState from '../components/common/ErrorState';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
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
    setProjectUuid,
    setQuoteChar,
    setSavedChartData,
    setSidebarOpen,
    setSql,
    setState,
    setWarehouseConnectionType,
} from '../features/sqlRunner/store/sqlRunnerSlice';
import { HeaderVirtualView } from '../features/virtualView';
import { type VirtualViewState } from '../features/virtualView/components/HeaderVirtualView';
import useToaster from '../hooks/toaster/useToaster';
import { useProject } from '../hooks/useProject';
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

    const params = useParams<{ projectUuid: string; slug?: string }>();
    const share = useSearchParams('share');
    const shareState = useSqlRunnerShareUrl(share || undefined);

    const location = useLocation();
    const navigate = useNavigate();

    const isLeftSidebarOpen = useAppSelector(
        (state) => state.sqlRunner.isLeftSidebarOpen,
    );
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
        }
    });

    useEffect(() => {
        if (!projectUuid && params.projectUuid) {
            dispatch(setProjectUuid(params.projectUuid));
        }
    }, [dispatch, params.projectUuid, projectUuid]);

    // Use the SQL string from the location state if available
    useEffect(() => {
        if (location.state?.sql) {
            dispatch(setSql(location.state.sql));
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

    useEffect(() => {
        if (project?.warehouseConnection?.type) {
            dispatch(
                setWarehouseConnectionType(project.warehouseConnection.type),
            );
            dispatch(
                setQuoteChar(
                    getFieldQuoteChar(project?.warehouseConnection?.type),
                ),
            );
        }
    }, [dispatch, project?.warehouseConnection?.type]);

    const handleSetSidebarOpen = (isOpen: boolean) => {
        dispatch(setSidebarOpen(isOpen));
    };

    if (chartError) {
        return <ErrorState error={chartError.error} />;
    }

    return (
        <Page
            title="SQL Runner"
            noContentPadding
            flexContent
            header={
                mode === 'virtualView' && virtualViewState ? (
                    <HeaderVirtualView virtualViewState={virtualViewState} />
                ) : (
                    <Header mode={params.slug ? 'edit' : 'create'} />
                )
            }
            isSidebarOpen={isLeftSidebarOpen}
            sidebar={<Sidebar setSidebarOpen={handleSetSidebarOpen} />}
            noSidebarPadding
        >
            <Group
                align="stretch"
                grow
                spacing="none"
                p={0}
                style={{ flex: 1 }}
                w={'100%'}
            >
                {!isLeftSidebarOpen && (
                    <Paper
                        shadow="none"
                        radius={0}
                        px="sm"
                        py="lg"
                        style={{ flexGrow: 0 }}
                    >
                        <Stack spacing="xs">
                            <Tooltip
                                variant="xs"
                                label={'Open sidebar'}
                                position="right"
                            >
                                <ActionIcon
                                    size="sm"
                                    onClick={() => handleSetSidebarOpen(true)}
                                >
                                    <MantineIcon
                                        icon={IconLayoutSidebarLeftExpand}
                                    />
                                </ActionIcon>
                            </Tooltip>
                        </Stack>
                    </Paper>
                )}
                <ContentPanel />
            </Group>
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
