import { ChartKind } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Paper,
    Stack,
    Title,
    Tooltip,
} from '@mantine/core';
import { useDebouncedValue, useElementSize, useHotkeys } from '@mantine/hooks';
import {
    IconAdjustmentsCog,
    IconChartHistogram,
    IconCodeCircle,
    IconLayoutNavbarCollapse,
    IconLayoutNavbarExpand,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { ResizableBox } from 'react-resizable';
import { ConditionalVisibility } from '../../../components/common/ConditionalVisibility';
import MantineIcon from '../../../components/common/MantineIcon';
import RunSqlQueryButton from '../../../components/SqlRunner/RunSqlQueryButton';
import { useSqlQueryRun } from '../hooks/useSqlQueryRun';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    EditorTabs,
    setActiveEditorTab,
    setSqlRunnerResults,
    setSql,
} from '../store/sqlRunnerSlice';
import { SqlEditor } from './SqlEditor';
import BarChart from './visualizations/BarChart';
import { Table } from './visualizations/Table';

type Props = {
    isChartConfigOpen: boolean;
    openChartConfig: () => void;
    closeChartConfig: () => void;
};

const MIN_RESULTS_HEIGHT = 50;

export const ContentPanel: FC<Props> = ({
    isChartConfigOpen,
    openChartConfig,
    closeChartConfig,
}) => {
    const dispatch = useAppDispatch();

    const {
        ref: inputSectionRef,
        width: inputSectionWidth,
        height: inputSectionHeight,
    } = useElementSize();
    const { ref: wrapperRef, height: wrapperHeight } = useElementSize();
    const [resultsHeight, setResultsHeight] = useState(MIN_RESULTS_HEIGHT);
    const maxResultsHeight = useMemo(() => wrapperHeight - 56, [wrapperHeight]);
    const isResultsHeightMoreThanHalf = useMemo(
        () => resultsHeight > wrapperHeight / 2,
        [resultsHeight, wrapperHeight],
    );
    // NOTE: debounce is used to avoid the chart from being resized too often
    const [debouncedInputSectionHeight] = useDebouncedValue(
        inputSectionHeight,
        100,
    );
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
    const tableVisConfig = useAppSelector(
        (state) => state.tableVisConfig.config,
    );

    const barChartConfig = useAppSelector(
        (state) => state.barChartConfig.config,
    );

    const {
        mutate: runSqlQuery,
        data: queryResults,
        isLoading,
    } = useSqlQueryRun({
        onSuccess: (data) => {
            if (data) {
                dispatch(setSqlRunnerResults(data));
                if (activeEditorTab === EditorTabs.SQL) {
                    dispatch(setActiveEditorTab(EditorTabs.VISUALIZATION));
                }
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
                    py="sm"
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
                            <Group spacing="xs">
                                <Button
                                    size="xs"
                                    color="dark"
                                    variant={
                                        activeEditorTab === EditorTabs.SQL
                                            ? 'filled'
                                            : 'subtle'
                                    }
                                    onClick={() =>
                                        !isLoading &&
                                        dispatch(
                                            setActiveEditorTab(EditorTabs.SQL),
                                        )
                                    }
                                    leftIcon={
                                        <MantineIcon icon={IconCodeCircle} />
                                    }
                                >
                                    SQL
                                </Button>
                                <Button.Group>
                                    <Button
                                        size="xs"
                                        color="dark"
                                        variant={
                                            activeEditorTab ===
                                            EditorTabs.VISUALIZATION
                                                ? 'filled'
                                                : 'subtle'
                                        }
                                        // TODO: remove once we add an empty state
                                        disabled={!queryResults?.results}
                                        onClick={() =>
                                            !isLoading &&
                                            dispatch(
                                                setActiveEditorTab(
                                                    EditorTabs.VISUALIZATION,
                                                ),
                                            )
                                        }
                                        leftIcon={
                                            <MantineIcon
                                                icon={IconChartHistogram}
                                            />
                                        }
                                    >
                                        Chart
                                    </Button>
                                    {activeEditorTab ===
                                        EditorTabs.VISUALIZATION && (
                                        <Button
                                            variant={
                                                isChartConfigOpen
                                                    ? 'filled'
                                                    : 'outline'
                                            }
                                            color="dark"
                                            size="xs"
                                            onClick={
                                                isChartConfigOpen
                                                    ? closeChartConfig
                                                    : openChartConfig
                                            }
                                            leftIcon={
                                                <MantineIcon
                                                    icon={IconAdjustmentsCog}
                                                />
                                            }
                                        >
                                            Configure
                                        </Button>
                                    )}
                                </Button.Group>
                            </Group>
                        </Group>

                        <Group spacing="md">
                            <RunSqlQueryButton
                                isLoading={isLoading}
                                onSubmit={() => {
                                    if (!sql) return;
                                    runSqlQuery({
                                        sql,
                                    });
                                }}
                            />
                            <Tooltip
                                key={String(isResultsHeightMoreThanHalf)}
                                variant="xs"
                                label={
                                    !isResultsHeightMoreThanHalf
                                        ? 'Collapse'
                                        : 'Expand'
                                }
                                position="bottom"
                            >
                                <ActionIcon
                                    size="xs"
                                    onClick={() =>
                                        setResultsHeight(
                                            isResultsHeightMoreThanHalf
                                                ? MIN_RESULTS_HEIGHT
                                                : maxResultsHeight,
                                        )
                                    }
                                >
                                    <MantineIcon
                                        icon={
                                            !isResultsHeightMoreThanHalf
                                                ? IconLayoutNavbarCollapse
                                                : IconLayoutNavbarExpand
                                        }
                                    />
                                </ActionIcon>
                            </Tooltip>
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
                    })}
                >
                    <Box
                        style={{ flex: 1 }}
                        sx={{
                            position: 'absolute',
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
                            {queryResults?.results && barChartConfig && (
                                <BarChart
                                    data={queryResults}
                                    config={barChartConfig}
                                    isLoading={isLoading}
                                    style={{
                                        // NOTE: Ensures the chart is always full height
                                        display:
                                            selectedChartType ===
                                            ChartKind.VERTICAL_BAR
                                                ? 'block'
                                                : 'none',
                                        height: debouncedInputSectionHeight,
                                        width: '100%',
                                        flex: 1,
                                    }}
                                />
                            )}

                            {queryResults?.results &&
                                selectedChartType === ChartKind.TABLE && (
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
                                            config={tableVisConfig}
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
                            py="sm"
                            withBorder
                            bg="gray.1"
                            sx={(theme) => ({
                                borderWidth: isResultsPanelFullHeight
                                    ? '0 0 0 1px'
                                    : '0 0 1px 1px',
                                borderStyle: 'solid',
                                borderColor: theme.colors.gray[3],
                                cursor: 'ns-resize',
                            })}
                        >
                            <Group position="apart">
                                <Title order={5}>Results</Title>
                                <Group noWrap>
                                    <Tooltip
                                        key={String(
                                            isResultsHeightMoreThanHalf,
                                        )}
                                        variant="xs"
                                        label={
                                            isResultsHeightMoreThanHalf
                                                ? 'Collapse'
                                                : 'Expand'
                                        }
                                        position="bottom"
                                    >
                                        <ActionIcon
                                            size="xs"
                                            onClick={() =>
                                                setResultsHeight(
                                                    isResultsHeightMoreThanHalf
                                                        ? MIN_RESULTS_HEIGHT
                                                        : maxResultsHeight,
                                                )
                                            }
                                        >
                                            <MantineIcon
                                                icon={
                                                    isResultsHeightMoreThanHalf
                                                        ? IconLayoutNavbarExpand
                                                        : IconLayoutNavbarCollapse
                                                }
                                            />
                                        </ActionIcon>
                                    </Tooltip>
                                </Group>
                            </Group>
                        </Paper>
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
                        mt={50}
                        sx={(theme) => ({
                            flex: 1,
                            overflow: 'auto',
                            borderWidth: '0 0 1px 1px',
                            borderStyle: 'solid',
                            borderColor: theme.colors.gray[3],
                        })}
                    >
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
