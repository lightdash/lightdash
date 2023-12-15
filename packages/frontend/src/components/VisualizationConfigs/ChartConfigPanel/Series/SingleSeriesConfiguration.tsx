import {
    CartesianChartLayout,
    CartesianSeriesType,
    Series,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Checkbox,
    Collapse,
    Group,
    Select,
    Stack,
    TextInput,
} from '@mantine/core';
import {
    IconChevronDown,
    IconChevronUp,
    IconEye,
    IconEyeOff,
    IconGripVertical,
} from '@tabler/icons-react';
import React, { FC } from 'react';
import { DraggableProvidedDragHandleProps } from 'react-beautiful-dnd';
import MantineIcon from '../../../common/MantineIcon';
import { useVisualizationContext } from '../../../LightdashVisualization/VisualizationProvider';
import ColorSelector from '../../ColorSelector';

type Props = {
    isCollapsable?: boolean;
    seriesLabel: string;
    layout?: CartesianChartLayout;
    series: Series;
    isSingle?: boolean;
    fallbackColor?: string;
    isGrouped?: boolean;
    updateSingleSeries: (updatedSeries: Series) => void;
    isOpen?: boolean;
    toggleIsOpen?: () => void;
    dragHandleProps?: DraggableProvidedDragHandleProps;
};

const SingleSeriesConfiguration: FC<Props> = ({
    layout,
    isCollapsable,
    seriesLabel,
    series,
    fallbackColor,
    updateSingleSeries,
    isGrouped,
    isSingle,
    isOpen,
    toggleIsOpen,
    dragHandleProps,
}) => {
    const { colorPalette } = useVisualizationContext();
    const type =
        series.type === CartesianSeriesType.LINE && !!series.areaStyle
            ? CartesianSeriesType.AREA
            : series.type;

    const wrapExtraComponents =
        (isGrouped && !isSingle) || (!isGrouped && !isSingle);
    return (
        <Group noWrap={!wrapExtraComponents} spacing={0}>
            <Group
                noWrap
                spacing="xs"
                sx={
                    // TODO: this is here to position the color
                    // picker correctly in the grouped vs ungrouped cases.
                    // This isn't a great answer and we probably could
                    // clean up the layout in this file after the other parts
                    // of this panel are also migrated.
                    wrapExtraComponents
                        ? { justifyContent: 'flex-end' }
                        : { alignSelf: 'flex-start', marginTop: 32 }
                }
            >
                {isGrouped && (
                    <Box
                        {...dragHandleProps}
                        sx={{
                            opacity: 0.6,
                            '&:hover': { opacity: 1 },
                        }}
                    >
                        <MantineIcon icon={IconGripVertical} />
                    </Box>
                )}
                <ColorSelector
                    color={series.color || fallbackColor}
                    swatches={colorPalette}
                    onColorChange={(color) => {
                        updateSingleSeries({
                            ...series,
                            color,
                        });
                    }}
                />
                {!isSingle && (
                    <TextInput
                        disabled={series.hidden}
                        defaultValue={series.name || seriesLabel}
                        onBlur={(e) => {
                            updateSingleSeries({
                                ...series,
                                name: e.currentTarget.value,
                            });
                        }}
                    />
                )}
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
                            icon={series.hidden ? IconEye : IconEyeOff}
                        />
                    </ActionIcon>
                )}
                {isCollapsable && (
                    <ActionIcon onClick={toggleIsOpen}>
                        <MantineIcon
                            icon={isOpen ? IconChevronUp : IconChevronDown}
                        />
                    </ActionIcon>
                )}
            </Group>
            <Collapse in={!isCollapsable || isOpen || false}>
                <Box ml={isGrouped ? 'xl' : 'xs'} mt="xs" mr="sm" mb="md">
                    <Group spacing="xs" noWrap>
                        <Select
                            value={type}
                            size="xs"
                            label={!isGrouped && 'Chart type'}
                            data={[
                                {
                                    value: CartesianSeriesType.BAR,
                                    label: 'Bar',
                                },
                                {
                                    value: CartesianSeriesType.LINE,
                                    label: 'Line',
                                },
                                {
                                    value: CartesianSeriesType.AREA,
                                    label: 'Area',
                                },
                                {
                                    value: CartesianSeriesType.SCATTER,
                                    label: 'Scatter',
                                },
                            ]}
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
                            size="xs"
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
                            size="xs"
                            value={series.label?.position || 'hidden'}
                            data={[
                                { value: 'hidden', label: 'Hidden' },
                                { value: 'top', label: 'Top' },
                                { value: 'bottom', label: 'Bottom' },
                                { value: 'left', label: 'Left' },
                                { value: 'right', label: 'Right' },
                                { value: 'inside', label: 'Inside' },
                            ]}
                            onChange={(value) => {
                                updateSingleSeries({
                                    ...series,
                                    label:
                                        value === 'hidden'
                                            ? { show: false }
                                            : {
                                                  show: true,
                                                  position: value as any,
                                              },
                                });
                            }}
                        />
                    </Group>
                    {(type === CartesianSeriesType.LINE ||
                        type === CartesianSeriesType.AREA) && (
                        <Stack spacing="xs" mt="xs">
                            <Checkbox
                                checked={series.showSymbol ?? true}
                                label="Show symbol"
                                onChange={() => {
                                    updateSingleSeries({
                                        ...series,
                                        showSymbol: !(
                                            series.showSymbol ?? true
                                        ),
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
                        </Stack>
                    )}
                </Box>
            </Collapse>
        </Group>
    );
};

SingleSeriesConfiguration.defaultProps = {
    isGrouped: false,
};

export default SingleSeriesConfiguration;
