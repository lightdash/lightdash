import {
    BarChartDataTransformer,
    SqlRunnerResultsTransformer,
} from '@lightdash/common';
import { type BarChartConfig } from '@lightdash/common/src/types/visualizations';
import {
    ActionIcon,
    Button,
    Divider,
    Group,
    Loader,
    Paper,
    Stack,
    Title,
    Tooltip,
} from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import {
    IconAdjustmentsCog,
    IconLayoutNavbarCollapse,
    IconLayoutNavbarExpand,
    IconPlayerPlay,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import AceEditor from 'react-ace';
import { ResizableBox } from 'react-resizable';
import MantineIcon from '../../../components/common/MantineIcon';
import Table from '../../../components/common/Table';
import { getRawValueCell } from '../../../hooks/useColumns';
import { useSqlQueryRun } from '../hooks/useSqlQueryRun';
import BarChart from './visualizations/BarChart';

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
    const [sql, setSql] = useState<string>('');
    const { ref: wrapperRef, height: wrapperHeight } = useElementSize();
    const [resultsHeight, setResultsHeight] = useState(MIN_RESULTS_HEIGHT);
    const maxResultsHeight = useMemo(() => wrapperHeight - 58, [wrapperHeight]);
    const isResultsHeightMoreThanHalf = useMemo(
        () => resultsHeight > wrapperHeight / 2,
        [resultsHeight, wrapperHeight],
    );

    const {
        mutate: runSqlQuery,
        data: queryResults,
        isLoading,
    } = useSqlQueryRun();

    const sqlResultsTransformer = useMemo(
        () =>
            queryResults
                ? new SqlRunnerResultsTransformer({ data: queryResults })
                : undefined,
        [queryResults],
    );

    const barChartTransformer = useMemo(
        () =>
            sqlResultsTransformer
                ? new BarChartDataTransformer({
                      transformer: sqlResultsTransformer,
                  })
                : undefined,
        [sqlResultsTransformer],
    );

    // TODO: should come from the store
    const barChartConfig: BarChartConfig = {
        metadata: {
            version: 1,
        },
        type: 'barChart',
        style: {
            legend: {
                position: 'top',
                align: 'start',
            },
        },
        axesConfig: {
            x: {
                reference: 'status',
                label: 'moo',
            },
            y: [
                {
                    reference: 'total_amount',
                    position: 'left',
                    label: 'baz',
                },
            ],
        },
        seriesConfig: [],
    };

    return (
        <Stack
            spacing="none"
            style={{ flex: 1, overflow: 'hidden' }}
            ref={wrapperRef}
        >
            <Paper shadow="none" radius={0} px="md" py="sm" withBorder>
                <Group position="apart">
                    <Title order={5} c="gray.6">
                        SQL panel
                    </Title>
                    <Group spacing="md">
                        <Tooltip
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
                        <Tooltip
                            variant="xs"
                            label="Run query"
                            position="bottom"
                        >
                            <Button
                                size="xs"
                                leftIcon={<MantineIcon icon={IconPlayerPlay} />}
                                loading={isLoading}
                                onClick={() => {
                                    if (!sql) return;
                                    runSqlQuery({
                                        sql,
                                    });
                                }}
                            >
                                Run query
                            </Button>
                        </Tooltip>
                    </Group>
                </Group>
            </Paper>
            <Paper
                shadow="none"
                radius={0}
                p="none"
                withBorder
                style={{ flex: 1 }}
            >
                <AceEditor
                    mode="sql"
                    theme="github"
                    value={sql}
                    height="100%"
                    width="100%"
                    onChange={(value: string) => {
                        setSql(value);
                    }}
                    editorProps={{ $blockScrolling: true }}
                    enableBasicAutocompletion
                    enableLiveAutocompletion
                    wrapEnabled={true}
                />
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
                onResizeStop={(e, data) => setResultsHeight(data.size.height)}
            >
                <Paper shadow="none" radius={0} px="md" py="sm" withBorder>
                    <Group position="apart">
                        <Group spacing="xs">
                            <Title order={5} c="gray.6">
                                Results/Chart panel
                            </Title>
                            {isLoading && <Loader size="xs" />}
                        </Group>

                        <Group spacing="md">
                            <Tooltip
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
                                label="Run query"
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
                                    <MantineIcon icon={IconAdjustmentsCog} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                    </Group>
                </Paper>
                <Paper
                    shadow="none"
                    radius={0}
                    px="md"
                    py="sm"
                    withBorder
                    style={{ flex: 1 }}
                >
                    {queryResults && (
                        <Table
                            status={'success'}
                            data={queryResults}
                            columns={Object.keys(queryResults[0]).map((s) => ({
                                id: s,
                                accessorKey: s,
                                header: s.toLocaleUpperCase(),
                                cell: getRawValueCell,
                            }))}
                            pagination={{
                                show: false,
                            }}
                            footer={{
                                show: true,
                            }}
                        />
                    )}
                    {barChartTransformer && (
                        <BarChart
                            transformer={barChartTransformer}
                            config={barChartConfig}
                        />
                    )}
                </Paper>
            </ResizableBox>
        </Stack>
    );
};
