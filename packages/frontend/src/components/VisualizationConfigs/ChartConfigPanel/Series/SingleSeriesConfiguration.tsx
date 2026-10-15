import { type DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import {
    CartesianSeriesType,
    ChartType,
    getReadableTextColor,
    type CartesianChartLayout,
    type Series,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Checkbox,
    Collapse,
    Group,
    Popover,
    Select,
    Stack,
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
import { useTranslation } from 'react-i18next';
import type useCartesianChartConfig from '../../../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { calculateSeriesLikeIdentifier } from '../../../../hooks/useChartColorConfig/utils';
import MantineIcon from '../../../common/MantineIcon';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import ColorSelector from '../../ColorSelector';
import { EditableText } from '../../common/EditableText';
import { GrabIcon } from '../../common/GrabIcon';
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
    const { t } = useTranslation('vizConfig');
    const { visualizationConfig, colorPalette, getSeriesColor } =
        useVisualizationContext();
    const { hovered, ref } = useHover();

    const type =
        series.type === CartesianSeriesType.LINE && !!series.areaStyle
            ? CartesianSeriesType.AREA
            : series.type;
    const seriesColor = getSeriesColor(series);
    const automaticLabelColor =
        series.type === CartesianSeriesType.BAR &&
        series.label?.position === 'inside'
            ? getReadableTextColor(seriesColor)
            : seriesColor;
    const [seriesValue, setSeriesValue] = useDebouncedState(
        getSingleSeries(series)?.name || seriesLabel,
        200,
    );

    return (
        <Box>
            <Group justify="space-between">
                <Group gap="two" ref={ref} flex={1}>
                    {isGrouped && (
                        <GrabIcon
                            dragHandleProps={dragHandleProps}
                            hovered={hovered}
                            disabled={isDragDisabled}
                            disabledTooltip={t('series.orderDeterminedBySort')}
                        />
                    )}
                    {isGrouped && (
                        <ColorSelector
                            color={seriesColor}
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
                        <Box flex={1}>
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
            <Collapse expanded={!isCollapsable || isOpen || false}>
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
                            allowDeselect={false}
                            label={!isGrouped && t('series.axis')}
                            value={String(series.yAxisIndex)}
                            data={[
                                {
                                    value: '0',
                                    label: layout?.flipAxes
                                        ? t('series.position.bottom')
                                        : t('series.position.left'),
                                },
                                {
                                    value: '1',
                                    label: layout?.flipAxes
                                        ? t('series.position.top')
                                        : t('series.position.right'),
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
                            allowDeselect={false}
                            label={!isGrouped && t('series.valueLabels')}
                            value={series.label?.position || 'hidden'}
                            data={[
                                {
                                    value: 'hidden',
                                    label: t('series.position.hidden'),
                                },
                                {
                                    value: 'top',
                                    label: t('series.position.top'),
                                },
                                {
                                    value: 'bottom',
                                    label: t('series.position.bottom'),
                                },
                                {
                                    value: 'left',
                                    label: t('series.position.left'),
                                },
                                {
                                    value: 'right',
                                    label: t('series.position.right'),
                                },
                                {
                                    value: 'inside',
                                    label: t('series.position.inside'),
                                },
                            ]}
                            rightSection={
                                series.label?.show ? (
                                    <Popover position="bottom-end">
                                        <Popover.Target>
                                            <ActionIcon size="xs">
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
                                                    checked={
                                                        series.label
                                                            ?.showValue ?? true
                                                    }
                                                    label={t(
                                                        'series.showValue',
                                                    )}
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
                                                    label={t(
                                                        'series.showLabel',
                                                    )}
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
                                                    label={t(
                                                        'series.showMetricName',
                                                    )}
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
                                            ? {
                                                  ...series.label,
                                                  show: false,
                                              }
                                            : {
                                                  ...series.label,
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
                                                  showOverlappingLabels:
                                                      series.label
                                                          ?.showOverlappingLabels ??
                                                      false,
                                              },
                                });
                            }}
                        />
                        {series.label?.show && (
                            <Box mt={!isGrouped ? 'lg' : undefined}>
                                <ColorSelector
                                    color={series.label.color}
                                    defaultColor={automaticLabelColor}
                                    swatches={colorPalette}
                                    withAlpha
                                    ariaLabel={t(
                                        'series.selectValueLabelColor',
                                    )}
                                    onColorChange={(color) => {
                                        updateSingleSeries({
                                            ...series,
                                            label: {
                                                ...series.label,
                                                color,
                                            },
                                        });
                                    }}
                                    onColorReset={
                                        series.label.color
                                            ? () => {
                                                  updateSingleSeries({
                                                      ...series,
                                                      label: {
                                                          ...series.label,
                                                          color: undefined,
                                                      },
                                                  });
                                              }
                                            : undefined
                                    }
                                    resetLabel={t('series.useAutomaticColor')}
                                />
                            </Box>
                        )}
                    </Group>
                    {(type === CartesianSeriesType.LINE ||
                        type === CartesianSeriesType.AREA) && (
                        <Group gap="xs">
                            <Checkbox
                                size="xs"
                                checked={Boolean(series.showSymbol)}
                                label={t('series.showSymbol')}
                                onChange={() => {
                                    updateSingleSeries({
                                        ...series,
                                        showSymbol: !Boolean(series.showSymbol),
                                    });
                                }}
                            />
                            <Checkbox
                                size="xs"
                                checked={series.smooth}
                                label={t('series.smooth')}
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
