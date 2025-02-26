import { ChartKind, type OrganizationColorPalette } from '@lightdash/common';
import {
    Box,
    Button,
    ColorInput,
    Group,
    Modal,
    Paper,
    ScrollArea,
    SegmentedControl,
    SimpleGrid,
    Stack,
    Text,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconChevronDown, IconPalette } from '@tabler/icons-react';
import EChartsReact from 'echarts-for-react';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { useUpdateColorPalette } from '../../../hooks/appearance/useOrganizationAppearance';
import MantineIcon from '../../common/MantineIcon';
import { getChartIcon } from '../../common/ResourceIcon/utils';

interface EditPaletteModalProps {
    palette: OrganizationColorPalette;
    isOpen: boolean;
    onClose: () => void;
}

// Expanded mock data to show more categories
const MOCK_DATA = [
    { category: 'Category A', value: 120 },
    { category: 'Category B', value: 200 },
    { category: 'Category C', value: 150 },
    { category: 'Category D', value: 80 },
    { category: 'Category E', value: 170 },
    { category: 'Category F', value: 110 },
    { category: 'Category G', value: 130 },
    { category: 'Category H', value: 90 },
    { category: 'Category I', value: 160 },
    { category: 'Category J', value: 140 },
];

interface ChartPreviewProps {
    chartType: ChartKind;
    currentChartType: ChartKind;
    chartRef: React.MutableRefObject<EChartsReact | null>;
    options: any;
}

const ChartPreview: FC<ChartPreviewProps> = ({
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

export const EditPaletteModal: FC<EditPaletteModalProps> = ({
    palette,
    isOpen,
    onClose,
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

    const updateColorPalette = useUpdateColorPalette();
    const [chartType, setChartType] = useState<ChartKind>(
        ChartKind.VERTICAL_BAR,
    );
    const [showAllColors, setShowAllColors] = useState(false);

    // Create refs for each chart instance
    const barChartRef = useRef<EChartsReact>(null);
    const lineChartRef = useRef<EChartsReact>(null);
    const pieChartRef = useRef<EChartsReact>(null);

    const form = useForm<{ colors: string[] }>({
        initialValues: { colors: palette.colors },
        validate: {
            colors: (value) =>
                value.every((c) => c.startsWith('#')) ? null : 'Invalid colors',
        },
    });

    // Effect to handle chart instance cleanup and resize when chart type changes
    useEffect(() => {
        // Resize the current chart after switching
        setTimeout(() => {
            switch (chartType) {
                case ChartKind.VERTICAL_BAR:
                    barChartRef.current?.getEchartsInstance().resize();
                    break;
                case ChartKind.LINE:
                    lineChartRef.current?.getEchartsInstance().resize();
                    break;
                case ChartKind.PIE:
                    pieChartRef.current?.getEchartsInstance().resize();
                    break;
                default:
                    break;
            }
        }, 0);
    }, [chartType]);

    const handleUpdatePalette = () => {
        updateColorPalette.mutate({
            uuid: palette.colorPaletteUuid,
            colors: form.values.colors,
        });
        onClose();
    };

    // Create a bar chart option with the current palette colors
    const getChartOptions = useCallback(() => {
        const seriesNames = Array.from(
            { length: 10 },
            (_, i) => `Series ${i + 1}`,
        );

        return {
            tooltip: {
                trigger: 'axis',
                axisPointer: {
                    type: 'shadow',
                },
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
                data: ['Category A', 'Category B', 'Category C'],
                axisLabel: { show: false },
                axisLine: { show: false },
                axisTick: { show: false },
            },
            yAxis: {
                type: 'value',
                axisLabel: { show: false },
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { show: false },
            },
            series: seriesNames.map((name, index) => ({
                name,
                type: 'bar',
                data: [
                    Math.floor(Math.random() * 100) + 50,
                    Math.floor(Math.random() * 100) + 100,
                    Math.floor(Math.random() * 100) + 75,
                ],
                itemStyle: {
                    color: form.values.colors[
                        index % form.values.colors.length
                    ],
                },
            })),
        };
    }, [form.values.colors]);

    // Create a line chart option with the current palette colors
    const getLineChartOptions = useCallback(() => {
        const lineNames = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`);

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
            },
            yAxis: {
                type: 'value',
                axisLabel: { show: false },
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { show: false },
            },
            series: lineNames.map((name, index) => ({
                name,
                type: 'line',
                data: [
                    Math.floor(Math.random() * 100) + 100,
                    Math.floor(Math.random() * 100) + 150,
                    Math.floor(Math.random() * 100) + 120,
                    Math.floor(Math.random() * 100) + 140,
                    Math.floor(Math.random() * 100) + 110,
                ],
                itemStyle: {
                    color: form.values.colors[
                        index % form.values.colors.length
                    ],
                },
                lineStyle: {
                    color: form.values.colors[
                        index % form.values.colors.length
                    ],
                },
            })),
        };
    }, [form.values.colors]);

    // Create a pie chart option with the current palette colors
    const getPieChartOptions = useCallback(() => {
        return {
            tooltip: {
                trigger: 'item',
            },
            series: [
                {
                    name: 'Categories',
                    type: 'pie',
                    radius: ['40%', '70%'],
                    avoidLabelOverlap: false,
                    itemStyle: {
                        borderRadius: 10,
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
                    data: MOCK_DATA.slice(0, 10).map((item, index) => ({
                        value: item.value,
                        name: item.category,
                        itemStyle: {
                            color: form.values.colors[
                                index % form.values.colors.length
                            ],
                        },
                    })),
                },
            ],
        };
    }, [form.values.colors]);

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
        <Modal
            radius="sm"
            opened={isOpen}
            onClose={onClose}
            title={
                <Group>
                    <Paper p="xs" withBorder radius="sm">
                        <MantineIcon icon={IconPalette} size="sm" />
                    </Paper>
                    <Text color="dark.7" fw={500} fz="md">
                        Edit "{palette.name}" Palette
                    </Text>
                </Group>
            }
            styles={(theme) => ({
                header: {
                    borderBottom: `1px solid ${theme.colors.gray[2]}`,
                },
                body: {
                    padding: 0,
                },
            })}
            size="xl"
        >
            <Stack p="md" spacing="xs">
                <Text size="sm" color="gray.6">
                    Edit the colors in this palette. You can see a live preview
                    of how your changes will look in different chart types.
                </Text>

                <Group
                    align="flex-start"
                    spacing={0}
                    noWrap
                    h="100%"
                    sx={(theme) => ({
                        border: `1px solid ${theme.colors.gray[2]}`,
                        borderRadius: theme.radius.md,
                    })}
                >
                    {/* Left side - Color inputs */}
                    <Box
                        w={250}
                        miw={250}
                        p="md"
                        // Address scrollarea right padding
                        pr="xs"
                        pb="xs"
                        sx={(theme) => ({
                            borderRight: `1px solid ${theme.colors.gray[2]}`,
                        })}
                    >
                        <ScrollArea
                            h={200}
                            offsetScrollbars
                            styles={{
                                viewport: {
                                    maxHeight: 200,
                                },
                            }}
                        >
                            <SimpleGrid cols={2} spacing="xs">
                                {form.values.colors
                                    .slice(
                                        0,
                                        showAllColors
                                            ? form.values.colors.length
                                            : 10,
                                    )
                                    .map((color, index) => (
                                        <ColorInput
                                            key={index}
                                            value={color}
                                            onChange={(newColor) =>
                                                form.setFieldValue(
                                                    `colors.${index}`,
                                                    newColor,
                                                )
                                            }
                                            swatches={palette.colors}
                                            format="hex"
                                            size="xs"
                                            radius="sm"
                                            withPicker
                                            withEyeDropper={false}
                                        />
                                    ))}
                            </SimpleGrid>
                        </ScrollArea>

                        <Button
                            variant="subtle"
                            color="blue"
                            size="xs"
                            compact
                            radius="md"
                            onClick={() => setShowAllColors(!showAllColors)}
                            rightIcon={
                                <MantineIcon icon={IconChevronDown} size="xs" />
                            }
                            fullWidth
                            sx={{ alignSelf: 'flex-end' }}
                        >
                            {showAllColors
                                ? 'Show fewer colors'
                                : 'Show all colors'}
                        </Button>
                    </Box>

                    {/* Right side - Chart preview */}
                    <Stack
                        spacing="md"
                        sx={(theme) => ({
                            backgroundColor: theme.fn.lighten(
                                theme.colors.gray[0],
                                0.7,
                            ),
                        })}
                        h="100%"
                        style={{ flex: 1 }}
                        pt="xs"
                    >
                        <Group position="center">
                            <SegmentedControl
                                radius="sm"
                                value={chartType}
                                onChange={(value) =>
                                    setChartType(value as ChartKind)
                                }
                                data={AVAILABLE_VISUALIZATIONS.map((vis) => ({
                                    value: vis.value,
                                    label: <Box>{vis.icon}</Box>,
                                }))}
                                size="xs"
                            />
                        </Group>
                        <Box style={{ height: 190, position: 'relative' }}>
                            <ChartPreview
                                chartType={ChartKind.VERTICAL_BAR}
                                currentChartType={chartType}
                                chartRef={barChartRef}
                                options={chartOptions}
                            />
                            <ChartPreview
                                chartType={ChartKind.LINE}
                                currentChartType={chartType}
                                chartRef={lineChartRef}
                                options={lineChartOptions}
                            />
                            <ChartPreview
                                chartType={ChartKind.PIE}
                                currentChartType={chartType}
                                chartRef={pieChartRef}
                                options={pieChartOptions}
                            />
                        </Box>
                    </Stack>
                </Group>
            </Stack>

            <Group
                position="right"
                p="md"
                sx={(theme) => ({
                    borderTop: `1px solid ${theme.colors.gray[2]}`,
                })}
            >
                <Button variant="default" size="xs" onClick={onClose}>
                    Cancel
                </Button>
                <Button
                    onClick={handleUpdatePalette}
                    loading={updateColorPalette.isLoading}
                    size="xs"
                >
                    Save Changes
                </Button>
            </Group>
        </Modal>
    );
};
