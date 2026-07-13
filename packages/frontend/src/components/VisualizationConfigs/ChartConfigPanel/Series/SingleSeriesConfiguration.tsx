import { type DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import {
    CartesianSeriesType,
    ChartType,
    type CartesianChartLayout,
    type Series,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Checkbox,
    Collapse,
    Group,
    Stack,
} from '@mantine-8/core';
import { Popover, Select } from '@mantine/core';
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
import MantineIcon from '../../../common/MantineIcon';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import ColorSelector from '../../ColorSelector';
import { EditableText } from '../../common/EditableText';
import { GrabIcon } from '../../common/GrabIcon';
import compactStyles from '../../mantineTheme.module.css';
import { ChartTypeSelect } from './ChartTypeSelect';

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

    const type =
        series.type === CartesianSeriesType.LINE && !!series.areaStyle
            ? CartesianSeriesType.AREA
            : series.type;
    const [seriesValue, setSeriesValue] = useDebouncedState(
        getSingleSeries(series)?.name || seriesLabel,
        200,
    );

    return (
        <Box>
            <Group justify="space-between">
                <Group
                    gap="two"
                    ref={ref}
                    style={{
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

                <Group gap="one">
                    {isGrouped && (
                        <ActionIcon
                            variant="subtle"
                            color="gray"
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
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            onClick={toggleIsOpen}
                        >
                            <MantineIcon
                                color="ldGray.7"
                                icon={isOpen ? IconChevronUp : IconChevronDown}
                            />
                        </ActionIcon>
                    )}
                </Group>
            </Group>
            <Collapse in={!isCollapsable || isOpen || false}>
                <Stack ml="lg" gap="xs">
                    <Group gap="xs" wrap="nowrap">
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
                                                color="gray"
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
                                            <Stack gap="xs">
                                                <Checkbox
                                                    size="xs"
                                                    classNames={{
                                                        label: compactStyles.compactCheckboxLabel,
                                                    }}
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
                                                    classNames={{
                                                        label: compactStyles.compactCheckboxLabel,
                                                    }}
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
                                                    classNames={{
                                                        label: compactStyles.compactCheckboxLabel,
                                                    }}
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
                        <Group gap="xs">
                            <Checkbox
                                size="xs"
                                classNames={{
                                    label: compactStyles.compactCheckboxLabel,
                                }}
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
                                size="xs"
                                classNames={{
                                    label: compactStyles.compactCheckboxLabel,
                                }}
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
                </Stack>
            </Collapse>
        </Box>
    );
};

export default SingleSeriesConfiguration;
