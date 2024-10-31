import { getFieldQuoteChar } from '@lightdash/common';
import { ActionIcon, Group, Paper, Stack, Tooltip } from '@mantine/core';
import { IconLayoutSidebarLeftExpand } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { useMount, useUnmount } from 'react-use';
import ErrorState from '../components/common/ErrorState';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import {
    resetChartState,
    setChartConfig,
} from '../components/DataViz/store/actions/commonChartActions';
import { Sidebar } from '../features/sqlRunner';
import { ContentPanel } from '../features/sqlRunner/components/ContentPanel';
import { Header } from '../features/sqlRunner/components/Header';
import { useSavedSqlChart } from '../features/sqlRunner/hooks/useSavedSqlCharts';
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
    setSql,
    setState,
    setWarehouseConnectionType,
    type SqlRunnerState,
} from '../features/sqlRunner/store/sqlRunnerSlice';
import { HeaderVirtualView } from '../features/virtualView';
import { type VirtualViewState } from '../features/virtualView/components/HeaderVirtualView';
import useToaster from '../hooks/toaster/useToaster';
import { useProject } from '../hooks/useProject';
import useSearchParams from '../hooks/useSearchParams';
import { useGetShare } from '../hooks/useShare';

const SqlRunnerNew = ({
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
    const { data: sqlRunnerState, error: shareError } = useGetShare(
        share || undefined,
    );

    const location = useLocation<{ sql?: string }>();
    const history = useHistory();

    const [isLeftSidebarOpen, setLeftSidebarOpen] = useState(true);
    const { data: project } = useProject(projectUuid);
    const { showToastError } = useToaster();

    useEffect(() => {
        if (shareError) {
            showToastError({
                title: `Unable to load shared SQL runner state`,
                subtitle: shareError.error.message,
            });
            return;
        }
        if (sqlRunnerState?.params) {
            try {
                const reduxState = JSON.parse(
                    sqlRunnerState.params,
                ) as SqlRunnerState;
                dispatch(setState(reduxState));
            } catch (e) {
                console.error(
                    'Unable to parse sql runner redux state from shared URL',
                );
            }
        }
    }, [sqlRunnerState, dispatch, shareError, showToastError]);
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
            history.replace({ ...location, state: undefined });
        }
    }, [dispatch, location, history]);

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
            sidebar={<Sidebar setSidebarOpen={setLeftSidebarOpen} />}
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
                                    onClick={() => setLeftSidebarOpen(true)}
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
            <SqlRunnerNew
                isEditMode={isEditMode}
                virtualViewState={virtualViewState}
            />
        </Provider>
    );
};

export default SqlRunnerNewPage;
