import {
    isTableChartSQLConfig,
    type TableChartSqlConfig,
} from '@lightdash/common';
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
    useMemo,
    useState,
    type FC,
} from 'react';
import { ResizableBox } from 'react-resizable';
import { ConditionalVisibility } from '../../../components/common/ConditionalVisibility';
import MantineIcon from '../../../components/common/MantineIcon';
import { onResults } from '../../../components/DataViz/store/cartesianChartBaseSlice';
import { selectChartConfigByKind } from '../../../components/DataViz/store/selectors';
import ChartView from '../../../components/DataViz/visualizations/ChartView';
import { Table } from '../../../components/DataViz/visualizations/Table';
import RunSqlQueryButton from '../../../components/SqlRunner/RunSqlQueryButton';
import { useSqlQueryRun } from '../hooks/useSqlQueryRun';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    EditorTabs,
    setActiveEditorTab,
    setSqlLimit,
    setSqlRunnerResults,
} from '../store/sqlRunnerSlice';
import { SqlRunnerResultsTransformer } from '../transformers/SqlRunnerResultsTransformer';
import { SqlEditor } from './SqlEditor';

const MIN_RESULTS_HEIGHT = 10;

export const ContentPanel: FC = () => {
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

    const {
        mutate: runSqlQuery,
        data: queryResults,
        isLoading,
    } = useSqlQueryRun({
        onSuccess: (data) => {
            if (data) {
                dispatch(setSqlRunnerResults(data));
                dispatch(
                    onResults({
                        ...data,
                        transformer: new SqlRunnerResultsTransformer({
                            rows: data.results,
                            columns: data.columns,
                        }),
                    }),
                );
                if (resultsHeight === MIN_RESULTS_HEIGHT) {
                    setResultsHeight(inputSectionHeight / 2);
                }
            }
        },
    });

    // Run query on cmd + enter
    useHotkeys([
        [
            'mod + enter',
            () => {
                if (sql) runSqlQuery({ sql, limit: 7 });
            },
            { preventDefault: true },
        ],
    ]);

    const handleRunQuery = useCallback(
        (limitOverride?: number) => {
            if (!sql) return;
            runSqlQuery({
                sql,
                limit: limitOverride || limit,
            });
            notifications.clean();
        },
        [runSqlQuery, sql, limit],
    );

    const transformer = useMemo(
        () =>
            new SqlRunnerResultsTransformer({
                rows: queryResults?.results ?? [],
                columns: queryResults?.columns ?? [],
            }),
        [queryResults],
    );

    const activeConfigs = useAppSelector((state) => {
        const configsWithTable = state.sqlRunner.activeConfigs
            .map((type) => selectChartConfigByKind(state, type))
            .filter(
                (config): config is NonNullable<typeof config> =>
                    config !== undefined,
            );

        const tableConfig = configsWithTable.find(isTableChartSQLConfig);
        const chartConfigs = configsWithTable.filter(
            (
                c,
            ): c is Exclude<
                NonNullable<ReturnType<typeof selectChartConfigByKind>>,
                TableChartSqlConfig
            > => !isTableChartSQLConfig(c),
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
                                    handleRunQuery(newLimit);
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
                            overflowY: isTableChartSQLConfig(currentVisConfig)
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
                            {queryResults?.results && currentVisConfig && (
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
                                                transformer={transformer}
                                                style={{
                                                    height: deferredInputSectionHeight,
                                                    width: '100%',
                                                    flex: 1,
                                                    marginTop:
                                                        mantineTheme.spacing.sm,
                                                }}
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
