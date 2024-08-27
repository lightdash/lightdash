import { isVizTableConfig, type VizTableConfig } from '@lightdash/common';
import {
    Box,
    getDefaultZIndex,
    Group,
    LoadingOverlay,
    Paper,
    SegmentedControl,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { useElementSize, useHotkeys } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconChartHistogram, IconCodeCircle } from '@tabler/icons-react';
import {
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useState,
    type FC,
} from 'react';
import { ResizableBox } from 'react-resizable';
import { ConditionalVisibility } from '../../../components/common/ConditionalVisibility';
import MantineIcon from '../../../components/common/MantineIcon';
import { onResults } from '../../../components/DataViz/store/actions/commonChartActions';
import { selectChartConfigByKind } from '../../../components/DataViz/store/selectors';
import ChartView from '../../../components/DataViz/visualizations/ChartView';
import { Table } from '../../../components/DataViz/visualizations/Table';
import RunSqlQueryButton from '../../../components/SqlRunner/RunSqlQueryButton';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    useSqlQueryRun,
    type ResultsAndColumns,
} from '../hooks/useSqlQueryRun';
import { SqlRunnerResultsRunner } from '../runners/SqlRunnerResultsRunner';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    EditorTabs,
    setActiveEditorTab,
    setSqlLimit,
    setSqlRunnerResults,
} from '../store/sqlRunnerSlice';
import { SqlEditor } from './SqlEditor';

const MIN_RESULTS_HEIGHT = 10;

export const ContentPanel: FC = () => {
    const { showToastError } = useToaster();

    const dispatch = useAppDispatch();

    const {
        ref: inputSectionRef,
        width: inputSectionWidth,
        height: inputSectionHeight,
    } = useElementSize();
    const { ref: wrapperRef, height: wrapperHeight } = useElementSize();
    const [resultsHeight, setResultsHeight] = useState(MIN_RESULTS_HEIGHT);
    const maxResultsHeight = useMemo(() => wrapperHeight - 56, [wrapperHeight]);
    const mantineTheme = useMantineTheme();
    const deferredInputSectionHeight = useDeferredValue(inputSectionHeight);
    const deferredResultsHeight = useDeferredValue(resultsHeight);
    const isResultsPanelFullHeight = useMemo(
        () => resultsHeight === maxResultsHeight,
        [resultsHeight, maxResultsHeight],
    );

    const {
        projectUuid,
        sql,
        limit,
        activeEditorTab,
        selectedChartType,
        resultsTableConfig,
    } = useAppSelector((state) => state.sqlRunner);

    // currently editing chart config
    const currentVisConfig = useAppSelector((state) =>
        selectChartConfigByKind(state, selectedChartType),
    );

    const { mutateAsync: runSqlQuery, isLoading } = useSqlQueryRun(
        projectUuid,
        {
            onError: (err) => {
                showToastError({
                    title: 'Could not fetch SQL query results',
                    subtitle: err.error.message,
                });
            },
        },
    );

    // React Query Mutation does not have a way to keep previous results
    // like the React Query useQuery hook does. So we need to store the results
    // in the state to keep them around when the query is re-run.
    const [queryResults, setQueryResults] = useState<ResultsAndColumns>();

    const handleRunQuery = useCallback(
        async (limitOverride?: number) => {
            if (!sql) return;
            const newQueryResults = await runSqlQuery({
                sql,
                limit: limitOverride ?? limit,
            });

            setQueryResults(newQueryResults);
            notifications.clean();
        },
        [runSqlQuery, sql, limit],
    );

    // Run query on cmd + enter
    useHotkeys([
        ['mod + enter', () => handleRunQuery, { preventDefault: true }],
    ]);

    const resultsRunner = useMemo(() => {
        if (!queryResults) return;

        return new SqlRunnerResultsRunner({
            rows: queryResults.results,
            columns: queryResults.columns,
        });
    }, [queryResults]);

    useEffect(() => {
        // note: be mindful what you change here as the react-hooks/exhaustive-deps rule is disabled
        if (!queryResults || !resultsRunner) return;

        dispatch(setSqlRunnerResults(queryResults));
        dispatch(onResults({ ...queryResults, resultsRunner })); // TODO: Fix onResults

        if (resultsHeight === MIN_RESULTS_HEIGHT) {
            setResultsHeight(inputSectionHeight / 2);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        // inputSectionHeight,
        // resultsHeight,
        resultsRunner,
        dispatch,
        queryResults,
    ]);

    const activeConfigs = useAppSelector((state) => {
        const configsWithTable = state.sqlRunner.activeConfigs
            .map((type) => selectChartConfigByKind(state, type))
            .filter(
                (config): config is NonNullable<typeof config> =>
                    config !== undefined,
            );

        const tableConfig = configsWithTable.find(isVizTableConfig);
        const chartConfigs = configsWithTable.filter(
            (
                c,
            ): c is Exclude<
                NonNullable<ReturnType<typeof selectChartConfigByKind>>,
                VizTableConfig
            > => !isVizTableConfig(c),
        );

        return {
            chartConfigs,
            tableConfig,
        };
    });

    return (
        <Stack
            spacing="none"
            style={{ flex: 1, overflow: 'hidden' }}
            ref={wrapperRef}
        >
            <Tooltip.Group>
                <Paper
                    shadow="none"
                    radius={0}
                    px="md"
                    py={6}
                    bg="gray.1"
                    sx={(theme) => ({
                        borderWidth: isResultsPanelFullHeight
                            ? '0 0 0 1px'
                            : '0 0 1px 1px',
                        borderStyle: 'solid',
                        borderColor: theme.colors.gray[3],
                    })}
                >
                    <Group position="apart">
                        <Group position="apart">
                            <SegmentedControl
                                color="dark"
                                size="sm"
                                radius="sm"
                                data={[
                                    {
                                        value: 'sql',
                                        label: (
                                            <Group spacing="xs" noWrap>
                                                <MantineIcon
                                                    icon={IconCodeCircle}
                                                />
                                                <Text>Query</Text>
                                            </Group>
                                        ),
                                    },
                                    {
                                        value: 'chart',
                                        label: (
                                            <Group spacing="xs" noWrap>
                                                <MantineIcon
                                                    icon={IconChartHistogram}
                                                />
                                                <Text>Chart</Text>
                                            </Group>
                                        ),
                                        disabled: !queryResults?.results,
                                    },
                                ]}
                                defaultValue={'sql'}
                                onChange={(value) => {
                                    if (isLoading) {
                                        return;
                                    }
                                    if (value === 'sql') {
                                        dispatch(
                                            setActiveEditorTab(EditorTabs.SQL),
                                        );
                                    } else {
                                        dispatch(
                                            setActiveEditorTab(
                                                EditorTabs.VISUALIZATION,
                                            ),
                                        );
                                    }
                                }}
                            />
                        </Group>

                        <Group spacing="md">
                            <RunSqlQueryButton
                                isLoading={isLoading}
                                disabled={!sql}
                                limit={limit}
                                onSubmit={() => handleRunQuery()}
                                onLimitChange={(newLimit) => {
                                    dispatch(setSqlLimit(newLimit));
                                    return handleRunQuery(newLimit);
                                }}
                            />
                        </Group>
                    </Group>
                </Paper>

                <Paper
                    ref={inputSectionRef}
                    shadow="none"
                    radius={0}
                    style={{ flex: 1 }}
                    sx={(theme) => ({
                        borderWidth: '0 0 0 1px',
                        borderStyle: 'solid',
                        borderColor: theme.colors.gray[3],
                        overflow: 'auto',
                    })}
                >
                    <Box
                        style={{ flex: 1 }}
                        sx={{
                            position: 'absolute',
                            overflowY: isVizTableConfig(currentVisConfig)
                                ? 'auto'
                                : 'hidden',
                            height: inputSectionHeight,
                            width: inputSectionWidth,
                        }}
                    >
                        <ConditionalVisibility
                            isVisible={activeEditorTab === EditorTabs.SQL}
                        >
                            <SqlEditor onSubmit={() => handleRunQuery()} />
                        </ConditionalVisibility>

                        <ConditionalVisibility
                            isVisible={
                                activeEditorTab === EditorTabs.VISUALIZATION
                            }
                        >
                            {queryResults?.results &&
                                resultsRunner &&
                                currentVisConfig && (
                                    <>
                                        {activeConfigs.chartConfigs.map((c) => (
                                            <ConditionalVisibility
                                                key={c.type}
                                                isVisible={
                                                    selectedChartType === c.type
                                                }
                                            >
                                                <ChartView
                                                    data={queryResults}
                                                    config={c}
                                                    isLoading={isLoading}
                                                    resultsRunner={
                                                        resultsRunner
                                                    }
                                                    style={{
                                                        height: deferredInputSectionHeight,
                                                        width: '100%',
                                                        flex: 1,
                                                        marginTop:
                                                            mantineTheme.spacing
                                                                .sm,
                                                    }}
                                                    sql={sql}
                                                    projectUuid={projectUuid}
                                                    limit={limit}
                                                />
                                            </ConditionalVisibility>
                                        ))}

                                        {activeConfigs.tableConfig && (
                                            <Paper
                                                shadow="none"
                                                radius={0}
                                                px="sm"
                                                pb="sm"
                                                sx={() => ({
                                                    flex: 1,
                                                })}
                                            >
                                                <Table
                                                    data={queryResults.results}
                                                    config={
                                                        activeConfigs.tableConfig
                                                    }
                                                />
                                            </Paper>
                                        )}
                                    </>
                                )}
                        </ConditionalVisibility>
                    </Box>
                </Paper>

                <ResizableBox
                    height={deferredResultsHeight}
                    minConstraints={[50, 50]}
                    maxConstraints={[Infinity, maxResultsHeight]}
                    resizeHandles={['n']}
                    axis="y"
                    handle={
                        <Paper
                            pos="absolute"
                            top={0}
                            left={0}
                            right={0}
                            shadow="none"
                            radius={0}
                            px="md"
                            py={6}
                            withBorder
                            bg="gray.1"
                            sx={(theme) => ({
                                zIndex: getDefaultZIndex('modal') - 1,
                                borderWidth: isResultsPanelFullHeight
                                    ? '0 0 0 1px'
                                    : '0 0 1px 1px',
                                borderStyle: 'solid',
                                borderColor: theme.colors.gray[3],
                                cursor: 'ns-resize',
                            })}
                        />
                    }
                    style={{
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                    onResizeStop={(e, data) =>
                        setResultsHeight(data.size.height)
                    }
                >
                    <Paper
                        shadow="none"
                        radius={0}
                        p="sm"
                        mt="sm"
                        sx={(theme) => ({
                            flex: 1,
                            overflow: 'auto',
                            borderWidth: '0 0 1px 1px',
                            borderStyle: 'solid',
                            borderColor: theme.colors.gray[3],
                        })}
                    >
                        <LoadingOverlay
                            loaderProps={{
                                size: 'xs',
                            }}
                            visible={isLoading}
                        />
                        {queryResults?.results && (
                            <Table
                                data={queryResults.results}
                                config={resultsTableConfig}
                            />
                        )}
                    </Paper>
                </ResizableBox>
            </Tooltip.Group>
        </Stack>
    );
};
