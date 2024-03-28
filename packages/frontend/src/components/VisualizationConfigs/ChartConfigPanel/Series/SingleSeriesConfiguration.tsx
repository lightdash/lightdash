import { type DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import {
    CartesianSeriesType,
    type CartesianChartLayout,
    type Series,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Checkbox,
    Collapse,
    Group,
    Select,
    Stack,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
import {
    IconChevronDown,
    IconChevronUp,
    IconEye,
    IconEyeOff,
    IconGripVertical,
} from '@tabler/icons-react';
import { type FC } from 'react';
import type useCartesianChartConfig from '../../../../hooks/cartesianChartConfig/useCartesianChartConfig';
import MantineIcon from '../../../common/MantineIcon';
import { useVisualizationContext } from '../../../LightdashVisualization/VisualizationProvider';
import ColorSelector from '../../ColorSelector';
import { Config } from '../../common/Config';
import { EditableText } from '../common/EditableText';
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
} & Pick<ReturnType<typeof useCartesianChartConfig>, 'updateSingleSeries'>;

const SingleSeriesConfiguration: FC<Props> = ({
    layout,
    isCollapsable,
    seriesLabel,
    series,
    updateSingleSeries,
    isGrouped,
    isSingle,
    isOpen,
    toggleIsOpen,
    dragHandleProps,
}) => {
    const { colorPalette, getSeriesColor } = useVisualizationContext();
    const { hovered, ref } = useHover();
    const type =
        series.type === CartesianSeriesType.LINE && !!series.areaStyle
            ? CartesianSeriesType.AREA
            : series.type;

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
                        <Box
                            {...dragHandleProps}
                            sx={{
                                visibility: hovered ? 'visible' : 'hidden',
                                opacity: 0.6,
                                cursor: 'grab',
                                '&:hover': { opacity: 1 },
                            }}
                        >
                            <MantineIcon icon={IconGripVertical} />
                        </Box>
                    )}
                    {isGrouped && (
                        <ColorSelector
                            color={getSeriesColor(series)}
                            swatches={colorPalette}
                            onColorChange={(color) => {
                                updateSingleSeries({
                                    ...series,
                                    color,
                                });
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
                                defaultValue={series.name || seriesLabel}
                                onBlur={(e) => {
                                    updateSingleSeries({
                                        ...series,
                                        name: e.currentTarget.value,
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
                                icon={series.hidden ? IconEye : IconEyeOff}
                            />
                        </ActionIcon>
                    )}
                    {isCollapsable && (
                        <ActionIcon onClick={toggleIsOpen}>
                            <MantineIcon
                                color="gray.7"
                                icon={isOpen ? IconChevronUp : IconChevronDown}
                            />
                        </ActionIcon>
                    )}
                </Group>
            </Group>
            <Collapse in={!isCollapsable || isOpen || false}>
                <Stack ml={isGrouped ? 'lg' : 'none'} spacing="xs">
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
                            label={
                                !isGrouped && (
                                    <Config.SubLabel>Axis</Config.SubLabel>
                                )
                            }
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
                            label={
                                !isGrouped && (
                                    <Config.SubLabel>
                                        Value labels
                                    </Config.SubLabel>
                                )
                            }
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
                        <Group spacing="xs">
                            <Checkbox
                                size="xs"
                                sx={{
                                    label: {
                                        paddingLeft: 4,
                                    },
                                }}
                                checked={series.showSymbol ?? true}
                                label={
                                    <Config.SubLabel>
                                        Show symbol
                                    </Config.SubLabel>
                                }
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
                                size="xs"
                                checked={series.smooth}
                                label={
                                    <Config.SubLabel>Smooth</Config.SubLabel>
                                }
                                sx={{
                                    label: {
                                        paddingLeft: 4,
                                    },
                                }}
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

SingleSeriesConfiguration.defaultProps = {
    isGrouped: false,
};

export default SingleSeriesConfiguration;
