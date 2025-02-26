import { ChartKind } from '@lightdash/common';
import { Box, Group, SegmentedControl, Stack } from '@mantine/core';
import EChartsReact from 'echarts-for-react';
import { useCallback, useMemo, useRef, useState, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import { getChartIcon } from '../../common/ResourceIcon/utils';

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
            <EChartsReact
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
}

export const ChartPreviewComponent: FC<ChartPreviewComponentProps> = ({
    colors,
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

    // Create refs for each chart instance
    const barChartRef = useRef<EChartsReact>(null);
    const lineChartRef = useRef<EChartsReact>(null);
    const pieChartRef = useRef<EChartsReact>(null);

    // Create a bar chart option with the current palette colors
    const getChartOptions = useCallback(() => {
        // Use exactly 10 bars
        const seriesCount = 10;

        // Create individual series for each bar to prevent stacking
        const series = Array.from({ length: seriesCount }, (_, index) => ({
            type: 'bar',
            name: `Bar ${index + 1}`,
            data: [Math.floor(Math.random() * 50) + 50], // Random value between 50-100
            itemStyle: {
                color: colors[index % colors.length],
            },
            barGap: '10%', // Add some gap between bars
            barCategoryGap: '20%', // Add gap between categories
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

    // Create a line chart option with the current palette colors
    const getLineChartOptions = useCallback(() => {
        // Use exactly 10 lines
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
                stack: undefined, // Remove stacking/grouping
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

    // Create a pie chart option with the current palette colors
    const getPieChartOptions = useCallback(() => {
        // Use exactly 10 pie slices
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
            sx={(theme) => ({
                backgroundColor: theme.fn.lighten(theme.colors.gray[0], 0.7),
            })}
            h="100%"
            style={{ flex: 1 }}
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
            <Box style={{ height: 170, position: 'relative' }}>
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
