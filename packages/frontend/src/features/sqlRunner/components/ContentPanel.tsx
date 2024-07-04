import type { ResultRow } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Divider,
    Group,
    Paper,
    Stack,
    Tabs,
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
import EChartsReact from 'echarts-for-react';
import React, { useMemo, useState, type FC } from 'react';
import AceEditor from 'react-ace';
import { ResizableBox } from 'react-resizable';
import MantineIcon from '../../../components/common/MantineIcon';
import Table from '../../../components/common/Table';
import {
    type TableColumn,
    type TableHeader,
} from '../../../components/common/Table/types';
import { getRawValueCell } from '../../../hooks/useColumns';

type Props = {
    isChartConfigOpen: boolean;
    openChartConfig: () => void;
    closeChartConfig: () => void;
};

const MIN_RESULTS_HEIGHT = 50;

const MOCK_RESULTS: ResultRow[] = [
    {
        id: { value: { raw: 1, formatted: '1' } },
        name: { value: { raw: 'John', formatted: 'John' } },
        age: { value: { raw: 25, formatted: '25' } },
        country: { value: { raw: 'USA', formatted: 'USA' } },
    },
    {
        id: { value: { raw: 2, formatted: '2' } },
        name: { value: { raw: 'Jane', formatted: 'Jane' } },
        age: { value: { raw: 30, formatted: '30' } },
        country: { value: { raw: 'UK', formatted: 'UK' } },
    },
    {
        id: { value: { raw: 3, formatted: '3' } },
        name: { value: { raw: 'Alice', formatted: 'Alice' } },
        age: { value: { raw: 35, formatted: '35' } },
        country: { value: { raw: 'Germany', formatted: 'Germany' } },
    },
];
const MOCK_COLUMNS: Array<TableColumn | TableHeader> = [
    {
        id: 'id',
        accessorKey: 'id',
        header: 'ID',
        cell: getRawValueCell,
    },
    {
        id: 'name',
        accessorKey: 'name',
        header: 'Name',
        cell: getRawValueCell,
    },
    {
        id: 'age',
        accessorKey: 'age',
        header: 'Age',
        cell: getRawValueCell,
    },
    {
        id: 'country',
        accessorKey: 'country',
        header: 'Country',
        cell: getRawValueCell,
    },
];

const MOCK_CHART_DATA = {
    grid: {
        height: '250px',
        top: '90',
    },
    xAxis: {
        type: 'value',
    },
    yAxis: [
        {
            type: 'value',
            name: 'Num users',
            nameLocation: 'center',
            nameGap: '40',
        },
    ],
    legend: { top: '40' },
    series: [
        {
            name: 'mock chart results',
            data: MOCK_RESULTS.map((results) => {
                return [results.id.value.raw, results.age.value.raw];
            }),
            type: 'line',
            color: '#d7c1fa',
        },
    ],
};

export const ContentPanel: FC<Props> = ({
    isChartConfigOpen,
    openChartConfig,
    closeChartConfig,
}) => {
    const { ref: wrapperRef, height: wrapperHeight } = useElementSize();
    const [resultsHeight, setResultsHeight] = useState(MIN_RESULTS_HEIGHT);
    const maxResultsHeight = useMemo(() => wrapperHeight - 58, [wrapperHeight]);
    const isResultsHeightMoreThanHalf = useMemo(
        () => resultsHeight > wrapperHeight / 2,
        [resultsHeight, wrapperHeight],
    );
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
                    value={'SELECT * FROM table;'}
                    height="100%"
                    width="100%"
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
                        <Tabs defaultValue={'results'} w="100%">
                            <Tabs.List>
                                <Tabs.Tab value={'results'}>Results</Tabs.Tab>
                                <Tabs.Tab value={'chart'}>Chart</Tabs.Tab>
                                <Group ml="auto" spacing="md">
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
                                            <MantineIcon
                                                icon={IconAdjustmentsCog}
                                            />
                                        </ActionIcon>
                                    </Tooltip>
                                </Group>
                            </Tabs.List>
                            <Tabs.Panel value={'results'} w="100%">
                                <Table
                                    status={'success'}
                                    data={MOCK_RESULTS}
                                    columns={MOCK_COLUMNS}
                                    pagination={{
                                        show: false,
                                    }}
                                    footer={{
                                        show: true,
                                    }}
                                />
                            </Tabs.Panel>
                            <Tabs.Panel value={'chart'} w="100%">
                                <EChartsReact
                                    style={{ height: '400px' }}
                                    notMerge
                                    option={MOCK_CHART_DATA}
                                />
                            </Tabs.Panel>
                        </Tabs>
                    </Group>
                </Paper>
            </ResizableBox>
        </Stack>
    );
};
