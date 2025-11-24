import { ChartKind } from '@lightdash/common';
import { Box, Group, SegmentedControl, Stack } from '@mantine/core';
import { useCallback, useMemo, useRef, useState, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import { getChartIcon } from '../../common/ResourceIcon/utils';
import EChartsReactComponent, {
    type EChartsReact,
} from '../../EChartsReactWrapper';

interface SingleChartPreviewProps {
    chartType: ChartKind;
    currentChartType: ChartKind;
    chartRef: React.MutableRefObject<EChartsReact | null>;
    options: any;
}

const SingleChartPreview: FC<SingleChartPreviewProps> = ({
    chartType,
    currentChartType,
    chartRef,
    options,
}) => {
    return (
        <Box
            sx={{
                height: '100%',
                width: '100%',
                position: 'absolute',
                display: currentChartType === chartType ? 'block' : 'none',
            }}
        >
            <EChartsReactComponent
                ref={chartRef}
                option={options}
                style={{ height: '100%', width: '100%' }}
                opts={{ renderer: 'canvas' }}
                notMerge={true}
            />
        </Box>
    );
};

export interface ChartPreviewComponentProps {
    colors: string[];
    backgroundColor: string;
}

export const ChartPreviewComponent: FC<ChartPreviewComponentProps> = ({
    colors,
    backgroundColor,
}) => {
    const AVAILABLE_VISUALIZATIONS = [
        {
            value: ChartKind.VERTICAL_BAR,
            icon: (
                <MantineIcon
                    icon={getChartIcon(ChartKind.VERTICAL_BAR)}
                    size="sm"
                />
            ),
        },
        {
            value: ChartKind.LINE,
            icon: <MantineIcon icon={getChartIcon(ChartKind.LINE)} size="sm" />,
        },
        {
            value: ChartKind.PIE,
            icon: <MantineIcon icon={getChartIcon(ChartKind.PIE)} size="sm" />,
        },
    ];

    const [chartType, setChartType] = useState<ChartKind>(
        ChartKind.VERTICAL_BAR,
    );

    const barChartRef = useRef<EChartsReact>(null);
    const lineChartRef = useRef<EChartsReact>(null);
    const pieChartRef = useRef<EChartsReact>(null);

    // Create a bar chart option with the current palette colors
    const getChartOptions = useCallback(() => {
        const seriesCount = 10;

        const series = Array.from({ length: seriesCount }, (_, index) => ({
            type: 'bar',
            name: `Bar ${index + 1}`,
            data: [Math.floor(Math.random() * 50) + 50],
            itemStyle: {
                color: colors[index % colors.length],
            },
            barGap: '10%',
            barCategoryGap: '20%',
        }));

        return {
            tooltip: {
                trigger: 'item',
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '5%',
                containLabel: true,
                show: false,
            },
            xAxis: {
                type: 'category',
                data: ['Colors'],
                axisLabel: { show: false },
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: {
                    show: false,
                },
            },
            yAxis: {
                type: 'value',
                axisLabel: { show: false },
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: {
                    show: false,
                },
            },
            series: series,
        };
    }, [colors]);

    const getLineChartOptions = useCallback(() => {
        const seriesCount = 10;

        return {
            tooltip: {
                trigger: 'axis',
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '5%',
                containLabel: true,
                show: false,
            },
            xAxis: {
                type: 'category',
                data: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
                axisLabel: { show: false },
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: {
                    show: false,
                },
            },
            yAxis: {
                type: 'value',
                axisLabel: { show: false },
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: {
                    show: false,
                },
            },
            series: Array.from({ length: seriesCount }, (_, index) => ({
                name: `Line ${index + 1}`,
                type: 'line',
                stack: undefined,
                data: [
                    Math.floor(Math.random() * 50) + 50 + index * 5,
                    Math.floor(Math.random() * 50) + 70 + index * 5,
                    Math.floor(Math.random() * 50) + 60 + index * 5,
                    Math.floor(Math.random() * 50) + 80 + index * 5,
                    Math.floor(Math.random() * 50) + 55 + index * 5,
                ],
                itemStyle: {
                    color: colors[index % colors.length],
                },
                lineStyle: {
                    color: colors[index % colors.length],
                },
                symbol: 'circle',
                symbolSize: 6,
            })),
        };
    }, [colors]);

    const getPieChartOptions = useCallback(() => {
        const seriesCount = 10;

        return {
            tooltip: {
                trigger: 'item',
            },
            grid: {
                show: false,
            },
            series: [
                {
                    name: 'Categories',
                    type: 'pie',
                    avoidLabelOverlap: false,
                    itemStyle: {
                        borderColor: '#fff',
                        borderWidth: 2,
                    },
                    label: {
                        show: false,
                    },
                    emphasis: {
                        label: {
                            show: false,
                        },
                    },
                    labelLine: {
                        show: false,
                    },
                    data: Array.from({ length: seriesCount }, (_, index) => ({
                        value: 100 - index * 5, // Descending values for better visualization
                        name: `Category ${index + 1}`,
                        itemStyle: {
                            color: colors[index % colors.length],
                        },
                    })),
                },
            ],
        };
    }, [colors]);

    const chartOptions = useMemo(() => getChartOptions(), [getChartOptions]);
    const lineChartOptions = useMemo(
        () => getLineChartOptions(),
        [getLineChartOptions],
    );
    const pieChartOptions = useMemo(
        () => getPieChartOptions(),
        [getPieChartOptions],
    );

    return (
        <Stack
            spacing="sm"
            h="100%"
            style={{ flex: 1, backgroundColor }}
            pt="xs"
        >
            <Group position="center">
                <SegmentedControl
                    value={chartType}
                    onChange={(value) => setChartType(value as ChartKind)}
                    data={AVAILABLE_VISUALIZATIONS.map((vis) => ({
                        value: vis.value,
                        label: <Box>{vis.icon}</Box>,
                    }))}
                    size="xs"
                />
            </Group>
            <Box h={170} pos="relative" style={{ marginBottom: '25%' }}>
                <SingleChartPreview
                    chartType={ChartKind.VERTICAL_BAR}
                    currentChartType={chartType}
                    chartRef={barChartRef}
                    options={chartOptions}
                />
                <SingleChartPreview
                    chartType={ChartKind.LINE}
                    currentChartType={chartType}
                    chartRef={lineChartRef}
                    options={lineChartOptions}
                />
                <SingleChartPreview
                    chartType={ChartKind.PIE}
                    currentChartType={chartType}
                    chartRef={pieChartRef}
                    options={pieChartOptions}
                />
            </Box>
        </Stack>
    );
};
