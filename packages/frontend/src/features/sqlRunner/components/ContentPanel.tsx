import {
    ChartKind,
    isCartesianChartSQLConfig,
    isPieChartSQLConfig,
    isTableChartSQLConfig,
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
} from '@mantine/core';
import { useElementSize, useHotkeys } from '@mantine/hooks';
import { IconChartHistogram, IconCodeCircle } from '@tabler/icons-react';
import { useDeferredValue, useMemo, useState, type FC } from 'react';
import { ResizableBox } from 'react-resizable';
import { ConditionalVisibility } from '../../../components/common/ConditionalVisibility';
import MantineIcon from '../../../components/common/MantineIcon';
import RunSqlQueryButton from '../../../components/SqlRunner/RunSqlQueryButton';
import { useSqlQueryRun } from '../hooks/useSqlQueryRun';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectCurrentChartConfig } from '../store/selectors';
import {
    EditorTabs,
    setActiveEditorTab,
    setSql,
    setSqlRunnerResults,
} from '../store/sqlRunnerSlice';
import { SqlEditor } from './SqlEditor';
import SqlRunnerChart from './visualizations/SqlRunnerChart';
import { Table } from './visualizations/Table';

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
    const deferredInputSectionHeight = useDeferredValue(inputSectionHeight);
    const isResultsPanelFullHeight = useMemo(
        () => resultsHeight === maxResultsHeight,
        [resultsHeight, maxResultsHeight],
    );

    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const activeEditorTab = useAppSelector(
        (state) => state.sqlRunner.activeEditorTab,
    );

    const selectedChartType = useAppSelector(
        (state) => state.sqlRunner.selectedChartType,
    );

    // Static results table
    const resultsTableConfig = useAppSelector(
        (state) => state.sqlRunner.resultsTableConfig,
    );

    // configurable table
    const currentVisConfig = useAppSelector((state) =>
        selectCurrentChartConfig(state),
    );

    const {
        mutate: runSqlQuery,
        data: queryResults,
        isLoading,
    } = useSqlQueryRun({
        onSuccess: (data) => {
            if (data) {
                dispatch(setSqlRunnerResults(data));

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
                if (sql) runSqlQuery({ sql });
            },
            { preventDefault: true },
        ],
    ]);

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
                                onSubmit={() => {
                                    if (!sql) return;
                                    runSqlQuery({
                                        sql,
                                    });
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
                            overflowY: 'hidden',
                            height: inputSectionHeight,
                            width: inputSectionWidth,
                        }}
                    >
                        <ConditionalVisibility
                            isVisible={activeEditorTab === EditorTabs.SQL}
                        >
                            <SqlEditor
                                sql={sql}
                                onSqlChange={(newSql) =>
                                    dispatch(setSql(newSql))
                                }
                                onSubmit={() => runSqlQuery({ sql })}
                            />
                        </ConditionalVisibility>

                        <ConditionalVisibility
                            isVisible={
                                activeEditorTab === EditorTabs.VISUALIZATION
                            }
                        >
                            {queryResults?.results &&
                                currentVisConfig &&
                                (isCartesianChartSQLConfig(currentVisConfig) ||
                                    isPieChartSQLConfig(currentVisConfig)) && (
                                    <SqlRunnerChart
                                        data={queryResults}
                                        config={currentVisConfig}
                                        isLoading={isLoading}
                                        style={{
                                            // NOTE: Ensures the chart is always full height
                                            display:
                                                selectedChartType !==
                                                ChartKind.TABLE
                                                    ? 'block'
                                                    : 'none',
                                            height: deferredInputSectionHeight,
                                            width: '100%',
                                            flex: 1,
                                        }}
                                    />
                                )}

                            {queryResults?.results &&
                                isTableChartSQLConfig(currentVisConfig) && (
                                    <Paper
                                        shadow="none"
                                        radius={0}
                                        p="sm"
                                        sx={() => ({
                                            flex: 1,
                                            overflow: 'auto',
                                        })}
                                    >
                                        <Table
                                            data={queryResults.results}
                                            config={currentVisConfig}
                                        />
                                    </Paper>
                                )}
                        </ConditionalVisibility>
                    </Box>
                </Paper>

                <ResizableBox
                    height={resultsHeight}
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
