import { type DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import {
    CARTESIAN_SERIES_HIGHLIGHT_OPERATORS,
    CartesianSeriesType,
    ChartType,
    getSeriesId,
    isSeriesWithMixedChartTypes,
    StackType,
    type CartesianChartLayout,
    type CartesianSeriesHighlightOperator,
    type Series,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Checkbox,
    Collapse,
    Group,
    NumberInput,
    Popover,
    Select,
    Stack,
    Text,
} from '@mantine/core';
import { useDebouncedState, useHover } from '@mantine/hooks';
import {
    IconChevronDown,
    IconChevronUp,
    IconEye,
    IconEyeOff,
    IconSettings,
} from '@tabler/icons-react';
import { type FC } from 'react';
import type useCartesianChartConfig from '../../../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { calculateSeriesLikeIdentifier } from '../../../../hooks/useChartColorConfig/utils';
import { getFilterOptions } from '../../../common/Filters/FilterInputs/utils';
import MantineIcon from '../../../common/MantineIcon';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import ColorSelector from '../../ColorSelector';
import { Config } from '../../common/Config';
import { EditableText } from '../../common/EditableText';
import { GrabIcon } from '../../common/GrabIcon';
import { ChartTypeSelect } from './ChartTypeSelect';
import styles from './SingleSeriesConfiguration.module.css';

type Props = {
    isCollapsable?: boolean;
    seriesLabel: string;
    layout?: CartesianChartLayout;
    series: Series;
    isSingle?: boolean;
    isGrouped?: boolean;
    isOpen?: boolean;
    toggleIsOpen?: () => void;
    dragHandleProps?: DraggableProvidedDragHandleProps | null;
    isDragDisabled?: boolean;
} & Pick<
    ReturnType<typeof useCartesianChartConfig>,
    'updateSingleSeries' | 'getSingleSeries'
>;

const HIGHLIGHT_CONDITION_OPTIONS = getFilterOptions([
    ...CARTESIAN_SERIES_HIGHLIGHT_OPERATORS,
]);

const SingleSeriesConfiguration: FC<Props> = ({
    layout,
    isCollapsable,
    seriesLabel,
    series,
    getSingleSeries,
    updateSingleSeries,
    isGrouped = false,
    isSingle,
    isOpen,
    toggleIsOpen,
    dragHandleProps,
    isDragDisabled,
}) => {
    const { visualizationConfig, colorPalette, getSeriesColor } =
        useVisualizationContext();
    const { hovered, ref } = useHover();
    const chartConfig =
        visualizationConfig.chartType === ChartType.CARTESIAN
            ? visualizationConfig.chartConfig
            : undefined;
    const allSeries = chartConfig?.dirtyEchartsConfig?.series ?? [];
    const renderedSeriesCount = allSeries.filter(
        (entry) => !entry.hidden && !entry.isFilteredOut,
    ).length;
    const hasMixedChartTypes = isSeriesWithMixedChartTypes(allSeries);
    const hasStackedBars =
        chartConfig?.dirtyChartType === CartesianSeriesType.BAR &&
        (layout?.stack !== undefined
            ? layout.stack !== StackType.NONE && layout.stack !== false
            : allSeries.some(
                  (entry) =>
                      entry.type === CartesianSeriesType.BAR &&
                      entry.stack !== undefined,
              ));
    const canShowHighlight =
        !hasMixedChartTypes &&
        !hasStackedBars &&
        (chartConfig?.dirtyChartType === CartesianSeriesType.BAR ||
            (chartConfig?.dirtyChartType === CartesianSeriesType.LINE &&
                renderedSeriesCount > 1));

    const type =
        series.type === CartesianSeriesType.LINE && !!series.areaStyle
            ? CartesianSeriesType.AREA
            : series.type;
    const currentSeries = getSingleSeries(series) || series;
    const highlight = currentSeries.highlight;
    const [seriesValue, setSeriesValue] = useDebouncedState(
        currentSeries.name || seriesLabel,
        200,
    );
    const highlightCondition = highlight?.operator ?? null;

    const setHighlight = (nextHighlight: Series['highlight'] | undefined) => {
        if (!chartConfig) return;
        chartConfig.setSeriesHighlight(
            getSeriesId(currentSeries),
            nextHighlight,
        );
    };

    const getDefaultHighlight = (): NonNullable<Series['highlight']> => ({
        color: getSeriesColor(currentSeries),
        othersColor: '#d3d3d3',
    });

    return (
        <Box>
            <Group position="apart">
                <Group
                    spacing="two"
                    ref={ref}
                    sx={{
                        flexGrow: 1,
                    }}
                >
                    {isGrouped && (
                        <GrabIcon
                            dragHandleProps={dragHandleProps}
                            hovered={hovered}
                            disabled={isDragDisabled}
                            disabledTooltip="Series order is automatically determined by the sort applied to the grouped dimension"
                        />
                    )}
                    {isGrouped && (
                        <ColorSelector
                            color={getSeriesColor(series)}
                            swatches={colorPalette}
                            withAlpha
                            onColorChange={(color) => {
                                updateSingleSeries({
                                    ...series,
                                    color,
                                });
                                const serieId =
                                    calculateSeriesLikeIdentifier(series).join(
                                        '.',
                                    );

                                if (
                                    visualizationConfig.chartType ===
                                    ChartType.CARTESIAN
                                ) {
                                    const { updateMetadata } =
                                        visualizationConfig.chartConfig;

                                    updateMetadata({
                                        ...visualizationConfig.chartConfig
                                            .dirtyMetadata,
                                        [serieId]: { color },
                                    });
                                }
                            }}
                        />
                    )}
                    {!isSingle && isGrouped && (
                        <Box
                            style={{
                                flexGrow: 1,
                            }}
                        >
                            <EditableText
                                disabled={series.hidden}
                                defaultValue={seriesValue}
                                placeholder={seriesLabel}
                                onChange={(event) => {
                                    setSeriesValue(event.currentTarget.value);
                                    updateSingleSeries({
                                        ...series,
                                        name: event.currentTarget.value,
                                    });
                                }}
                            />
                        </Box>
                    )}
                </Group>

                <Group spacing="one">
                    {isGrouped && (
                        <ActionIcon
                            onClick={() => {
                                updateSingleSeries({
                                    ...series,
                                    hidden: !series.hidden,
                                });
                            }}
                        >
                            <MantineIcon
                                icon={series.hidden ? IconEyeOff : IconEye}
                            />
                        </ActionIcon>
                    )}
                    {isCollapsable && (
                        <ActionIcon onClick={toggleIsOpen}>
                            <MantineIcon
                                color="ldGray.7"
                                icon={isOpen ? IconChevronUp : IconChevronDown}
                            />
                        </ActionIcon>
                    )}
                </Group>
            </Group>
            <Collapse in={!isCollapsable || isOpen || false}>
                <Stack ml="lg" spacing="xs">
                    <Group spacing="xs" noWrap>
                        <ChartTypeSelect
                            showLabel={!isGrouped}
                            chartValue={type}
                            showMixed={false}
                            onChange={(value) => {
                                const newType =
                                    value === CartesianSeriesType.AREA
                                        ? CartesianSeriesType.LINE
                                        : value;
                                updateSingleSeries({
                                    ...series,
                                    type: newType as CartesianSeriesType,
                                    areaStyle:
                                        value === CartesianSeriesType.AREA
                                            ? {}
                                            : undefined,
                                });
                            }}
                        />

                        <Select
                            label={!isGrouped && 'Axis'}
                            value={String(series.yAxisIndex)}
                            data={[
                                {
                                    value: '0',
                                    label: layout?.flipAxes ? 'Bottom' : 'Left',
                                },
                                {
                                    value: '1',
                                    label: layout?.flipAxes ? 'Top' : 'Right',
                                },
                            ]}
                            onChange={(value) => {
                                updateSingleSeries({
                                    ...series,
                                    yAxisIndex: parseInt(value || '0', 10),
                                });
                            }}
                        />
                        <Select
                            label={!isGrouped && 'Value labels'}
                            value={series.label?.position || 'hidden'}
                            data={[
                                { value: 'hidden', label: 'Hidden' },
                                { value: 'top', label: 'Top' },
                                { value: 'bottom', label: 'Bottom' },
                                { value: 'left', label: 'Left' },
                                { value: 'right', label: 'Right' },
                                { value: 'inside', label: 'Inside' },
                            ]}
                            rightSection={
                                series.label?.show ? (
                                    <Popover
                                        position="bottom-end"
                                        shadow="md"
                                        withinPortal
                                    >
                                        <Popover.Target>
                                            <ActionIcon
                                                variant="subtle"
                                                size="xs"
                                            >
                                                <MantineIcon
                                                    icon={IconSettings}
                                                    color="gray.6"
                                                />
                                            </ActionIcon>
                                        </Popover.Target>
                                        <Popover.Dropdown>
                                            <Stack spacing="xs">
                                                <Checkbox
                                                    size="xs"
                                                    checked={
                                                        series.label
                                                            ?.showValue ?? true
                                                    }
                                                    label="Show value"
                                                    onChange={() => {
                                                        updateSingleSeries({
                                                            ...series,
                                                            label: {
                                                                ...series.label,
                                                                showValue: !(
                                                                    series.label
                                                                        ?.showValue ??
                                                                    true
                                                                ),
                                                            },
                                                        });
                                                    }}
                                                />
                                                <Checkbox
                                                    size="xs"
                                                    checked={
                                                        series.label
                                                            ?.showLabel ?? false
                                                    }
                                                    label="Show label"
                                                    onChange={() => {
                                                        updateSingleSeries({
                                                            ...series,
                                                            label: {
                                                                ...series.label,
                                                                showLabel:
                                                                    !series
                                                                        .label
                                                                        ?.showLabel,
                                                            },
                                                        });
                                                    }}
                                                />
                                                <Checkbox
                                                    size="xs"
                                                    checked={
                                                        series.label
                                                            ?.showSeriesName ??
                                                        false
                                                    }
                                                    label="Show metric name"
                                                    onChange={() => {
                                                        updateSingleSeries({
                                                            ...series,
                                                            label: {
                                                                ...series.label,
                                                                showSeriesName:
                                                                    !series
                                                                        .label
                                                                        ?.showSeriesName,
                                                            },
                                                        });
                                                    }}
                                                />
                                            </Stack>
                                        </Popover.Dropdown>
                                    </Popover>
                                ) : undefined
                            }
                            rightSectionProps={{
                                style: { pointerEvents: 'all' },
                            }}
                            onChange={(value) => {
                                updateSingleSeries({
                                    ...series,
                                    label:
                                        value === 'hidden'
                                            ? { show: false }
                                            : {
                                                  show: true,
                                                  position: value as any,
                                                  showValue:
                                                      series.label?.showValue ??
                                                      true,
                                                  showLabel:
                                                      series.label?.showLabel ??
                                                      false,
                                                  showSeriesName:
                                                      series.label
                                                          ?.showSeriesName ??
                                                      false,
                                              },
                                });
                            }}
                        />
                    </Group>
                    {(type === CartesianSeriesType.LINE ||
                        type === CartesianSeriesType.AREA) && (
                        <Group spacing="xs">
                            <Checkbox
                                checked={Boolean(series.showSymbol)}
                                label="Show symbol"
                                onChange={() => {
                                    updateSingleSeries({
                                        ...series,
                                        showSymbol: !Boolean(series.showSymbol),
                                    });
                                }}
                            />
                            <Checkbox
                                checked={series.smooth}
                                label="Smooth"
                                onChange={() => {
                                    updateSingleSeries({
                                        ...series,
                                        smooth: !series.smooth,
                                    });
                                }}
                            />
                        </Group>
                    )}
                    {canShowHighlight && (
                        <Stack spacing="xs">
                            <Checkbox
                                checked={Boolean(highlight)}
                                label="Highlight"
                                onChange={(event) => {
                                    if (event.currentTarget.checked) {
                                        setHighlight(getDefaultHighlight());
                                    } else {
                                        setHighlight(undefined);
                                    }
                                }}
                            />
                            {highlight && (
                                <Box
                                    className={`${styles.highlightPanel} ${styles.highlightPanelActive}`}
                                >
                                    <Stack spacing="xs">
                                        <Group spacing="md">
                                            <Group
                                                h={36}
                                                align="center"
                                                spacing="xs"
                                            >
                                                <ColorSelector
                                                    color={highlight.color}
                                                    swatches={colorPalette}
                                                    onColorChange={(color) =>
                                                        setHighlight({
                                                            ...highlight,
                                                            color,
                                                        })
                                                    }
                                                />
                                                <Text fz="xs" c="dimmed">
                                                    Matching
                                                </Text>
                                            </Group>
                                            <Group
                                                h={36}
                                                align="center"
                                                spacing="xs"
                                            >
                                                <ColorSelector
                                                    color={
                                                        highlight.othersColor
                                                    }
                                                    swatches={colorPalette}
                                                    onColorChange={(
                                                        othersColor,
                                                    ) =>
                                                        setHighlight({
                                                            ...highlight,
                                                            othersColor,
                                                        })
                                                    }
                                                />
                                                <Text fz="xs" c="dimmed">
                                                    Others
                                                </Text>
                                            </Group>
                                        </Group>
                                        {chartConfig?.dirtyChartType ===
                                            CartesianSeriesType.BAR && (
                                            <Group grow align="flex-start">
                                                <Box>
                                                    <Config.Label>
                                                        Condition
                                                    </Config.Label>
                                                    <Select
                                                        value={
                                                            highlightCondition
                                                        }
                                                        data={
                                                            HIGHLIGHT_CONDITION_OPTIONS
                                                        }
                                                        clearable
                                                        placeholder="No condition"
                                                        onChange={(value) => {
                                                            if (!value) {
                                                                setHighlight({
                                                                    ...highlight,
                                                                    operator:
                                                                        undefined,
                                                                    value: undefined,
                                                                });
                                                                return;
                                                            }

                                                            setHighlight({
                                                                ...highlight,
                                                                operator:
                                                                    value as CartesianSeriesHighlightOperator,
                                                            });
                                                        }}
                                                    />
                                                </Box>
                                                {highlightCondition && (
                                                    <Box>
                                                        <Config.Label>
                                                            Value
                                                        </Config.Label>
                                                        <NumberInput
                                                            value={
                                                                highlight.value
                                                            }
                                                            onChange={(value) =>
                                                                setHighlight({
                                                                    ...highlight,
                                                                    value:
                                                                        typeof value ===
                                                                        'number'
                                                                            ? value
                                                                            : undefined,
                                                                })
                                                            }
                                                        />
                                                    </Box>
                                                )}
                                            </Group>
                                        )}
                                    </Stack>
                                </Box>
                            )}
                        </Stack>
                    )}
                </Stack>
            </Collapse>
        </Box>
    );
};

export default SingleSeriesConfiguration;
