import { ChartKind } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Divider,
    Group,
    Loader,
    Paper,
    Stack,
    Tabs,
    Title,
    Tooltip,
} from '@mantine/core';
import { useElementSize, useHotkeys } from '@mantine/hooks';
import {
    IconAdjustmentsCog,
    IconLayoutNavbarCollapse,
    IconLayoutNavbarExpand,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { ResizableBox } from 'react-resizable';
import MantineIcon from '../../../components/common/MantineIcon';
import RunSqlQueryButton from '../../../components/SqlRunner/RunSqlQueryButton';
import { useSqlQueryRun } from '../hooks/useSqlQueryRun';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    setActiveVisTab,
    setInitialResultsAndSeries,
    setSql,
    VisTabs,
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
    const isResultsPanelFullHeight = useMemo(
        () => resultsHeight === maxResultsHeight,
        [resultsHeight, maxResultsHeight],
    );

    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const activeVisTab = useAppSelector(
        (state) => state.sqlRunner.activeVisTab,
    );

    const selectedChartType = useAppSelector(
        (state) => state.sqlRunner.selectedChartType,
    );

    // Static results table
    const resultsTableConfig = useAppSelector(
        (state) => state.sqlRunner.resultsTableConfig,
    );
    const barChartConfig = useAppSelector(
        (state) => state.sqlRunner.barChartConfig,
    );

    // configurable table
    const tableVisConfig = useAppSelector(
        (state) => state.sqlRunner.tableChartConfig,
    );

    const {
        mutate: runSqlQuery,
        data: queryResults,
        isLoading,
    } = useSqlQueryRun({
        onSuccess: (data) => {
            if (data?.results) {
                dispatch(setInitialResultsAndSeries(data.results));
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
                    sx={(theme) => ({
                        borderWidth: isResultsPanelFullHeight
                            ? '0 0 0 1px'
                            : '0 0 1px 1px',
                        borderStyle: 'solid',
                        borderColor: theme.colors.gray[3],
                    })}
                >
                    <Group position="apart">
                        <Title order={5} c="gray.6">
                            SQL panel
                        </Title>
                        <Group spacing="md">
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
                            <RunSqlQueryButton
                                isLoading={isLoading}
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
                    p="none"
                    style={{ flex: 1 }}
                    sx={(theme) => ({
                        borderWidth: '0 0 0 1px',
                        borderStyle: 'solid',
                        borderColor: theme.colors.gray[3],
                    })}
                >
                    <Box
                        sx={{
                            position: 'absolute',
                            height: inputSectionHeight,
                            width: inputSectionWidth,
                        }}
                    >
                        <SqlEditor
                            sql={sql}
                            onSqlChange={(newSql) => dispatch(setSql(newSql))}
                            onSubmit={() => runSqlQuery({ sql })}
                        />
                    </Box>
                </Paper>
                <ResizableBox
                    height={resultsHeight}
                    minConstraints={[50, 50]}
                    maxConstraints={[Infinity, maxResultsHeight]}
                    resizeHandles={['n']}
                    axis="y"
                    handle={
                        <Divider
                            h={3}
                            bg="gray.3"
                            pos="absolute"
                            top={-2}
                            left={0}
                            right={0}
                            sx={{
                                cursor: 'ns-resize',
                            }}
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
                    <Stack h="100%" spacing={0}>
                        <Paper
                            shadow="none"
                            radius={0}
                            px="md"
                            pb={0}
                            pt="sm"
                            withBorder
                        >
                            <Group position="apart" pb={0} noWrap>
                                <Tabs
                                    value={activeVisTab}
                                    onTabChange={(val: VisTabs) => {
                                        dispatch(setActiveVisTab(val));
                                    }}
                                    // Negative margin to ge the tab indicator on the border
                                    mb={-2}
                                >
                                    <Tabs.List>
                                        <Tabs.Tab
                                            value={VisTabs.CHART}
                                            disabled={isLoading}
                                        >
                                            Chart
                                        </Tabs.Tab>
                                        <Tabs.Tab
                                            value={VisTabs.RESULTS}
                                            disabled={isLoading}
                                        >
                                            Results
                                        </Tabs.Tab>
                                        {isLoading && (
                                            <Loader mt="xs" size="xs" />
                                        )}
                                    </Tabs.List>
                                </Tabs>

                                <Group spacing="md" pb="sm" noWrap>
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
                                    <Tooltip
                                        variant="xs"
                                        label="Configure"
                                        position="bottom"
                                    >
                                        <ActionIcon
                                            size="xs"
                                            onClick={
                                                isChartConfigOpen
                                                    ? closeChartConfig
                                                    : openChartConfig
                                            }
                                        >
                                            <MantineIcon
                                                icon={IconAdjustmentsCog}
                                            />
                                        </ActionIcon>
                                    </Tooltip>
                                </Group>
                            </Group>
                        </Paper>

                        {queryResults?.results && !isLoading && (
                            <Paper
                                shadow="none"
                                radius={0}
                                px="md"
                                py="sm"
                                sx={(theme) => ({
                                    flex: 1,
                                    overflow: 'auto',
                                    borderWidth: '0 0 1px 1px',
                                    borderStyle: 'solid',
                                    borderColor: theme.colors.gray[3],
                                })}
                                h="100%"
                            >
                                {activeVisTab === VisTabs.CHART && (
                                    <>
                                        {selectedChartType ===
                                            ChartKind.TABLE && (
                                            <Table
                                                data={queryResults.results}
                                                config={tableVisConfig}
                                            />
                                        )}
                                        {selectedChartType ===
                                            ChartKind.VERTICAL_BAR && (
                                            <BarChart
                                                data={queryResults.results}
                                                config={barChartConfig}
                                            />
                                        )}
                                    </>
                                )}
                                {activeVisTab === VisTabs.RESULTS && (
                                    <>
                                        <Table
                                            data={queryResults.results}
                                            config={resultsTableConfig}
                                        />
                                    </>
                                )}
                            </Paper>
                        )}
                    </Stack>
                </ResizableBox>
            </Tooltip.Group>
        </Stack>
    );
};
