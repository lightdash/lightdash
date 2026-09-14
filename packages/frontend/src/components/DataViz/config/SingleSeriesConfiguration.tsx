import { type DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import {
    AxisSide,
    getEChartsChartTypeFromChartKind,
    ValueLabelPositionOptions,
    type CartesianChartDisplay,
    type ChartKind,
} from '@lightdash/common';
import {
    TextInput,
    Box,
    Flex,
    Group,
    Stack,
    Text,
    SegmentedControl,
} from '@mantine/core';
import { IconAlignLeft, IconAlignRight } from '@tabler/icons-react';
import MantineIcon from '../../common/MantineIcon';
import {
    SeriesDepthControl,
    type SeriesDrawOrderControl,
} from '../../VisualizationConfigs/ChartConfigPanel/Series/SeriesDrawOrder';
import drawOrderStyles from '../../VisualizationConfigs/ChartConfigPanel/Series/seriesDrawOrder.module.css';
import ColorSelector from '../../VisualizationConfigs/ColorSelector';
import { Config } from '../../VisualizationConfigs/common/Config';
import { GrabIcon } from '../../VisualizationConfigs/common/GrabIcon';
import classes from './CartesianChartSeries.module.css';
import { CartesianChartTypeConfig } from './CartesianChartTypeConfig';
import { CartesianChartValueLabelConfig } from './CartesianChartValueLabelConfig';

const LABEL_WIDTH = 120;

type SingleSeriesConfigurationProps = {
    dragHandleProps?: DraggableProvidedDragHandleProps | null;
    drawOrder?: SeriesDrawOrderControl;
    reference: string;
    color: string | undefined;
    colors: string[];
    label?: string;
    type: NonNullable<CartesianChartDisplay['series']>[number]['type'];
    whichYAxis?: number;
    valueLabelPosition: ValueLabelPositionOptions | undefined;
    selectedChartType: ChartKind;
    onColorChange: (reference: string, color: string) => void;
    onLabelChange: (reference: string, label: string) => void;
    onTypeChange: (
        reference: string,
        type: NonNullable<CartesianChartDisplay['series']>[number]['type'],
    ) => void;
    onAxisChange: (reference: string, value: AxisSide) => void;
    onValueLabelPositionChange: (
        reference: string,
        position: ValueLabelPositionOptions,
    ) => void;
};

export const SingleSeriesConfiguration = ({
    reference,
    dragHandleProps,
    drawOrder,
    color,
    colors,
    label,
    type,
    whichYAxis = 0,
    valueLabelPosition,
    selectedChartType,
    onColorChange,
    onLabelChange,
    onTypeChange,
    onAxisChange,
    onValueLabelPositionChange,
}: SingleSeriesConfigurationProps) => {
    return (
        <Stack key={reference} gap="xs">
            <Stack gap="xs" className={classes.seriesCard}>
                <Group
                    gap="xs"
                    wrap="nowrap"
                    className={drawOrderStyles.seriesHeader}
                >
                    {dragHandleProps && (
                        <GrabIcon dragHandleProps={dragHandleProps} />
                    )}
                    <Config.Subheading>{reference}</Config.Subheading>
                    {drawOrder && <SeriesDepthControl control={drawOrder} />}
                </Group>
                <Flex justify="flex-start" align="center" wrap="nowrap">
                    <Config.Label w={LABEL_WIDTH}>Label</Config.Label>
                    <Group
                        gap="xs"
                        justify="flex-start"
                        wrap="nowrap"
                        grow
                        flex={3}
                    >
                        <Group gap={0} flex={1} wrap="nowrap">
                            <Box w="20px">
                                <ColorSelector
                                    color={color}
                                    withAlpha
                                    onColorChange={(c) =>
                                        onColorChange(reference, c)
                                    }
                                    swatches={colors}
                                />
                            </Box>
                            <TextInput
                                size="xs"
                                maw="100%"
                                value={label}
                                onChange={(e) =>
                                    onLabelChange(reference, e.target.value)
                                }
                                flex={1}
                                ml="xs"
                            />
                        </Group>
                    </Group>
                </Flex>
                <Flex justify="flex-start" align="center" wrap="nowrap">
                    <Config.Label w={LABEL_WIDTH}>Chart Type</Config.Label>
                    <CartesianChartTypeConfig
                        canSelectDifferentTypeFromBaseChart={true}
                        type={
                            type ??
                            getEChartsChartTypeFromChartKind(selectedChartType)
                        }
                        onChangeType={(value) => onTypeChange(reference, value)}
                    />
                </Flex>
                <Flex justify="flex-start" align="center" wrap="nowrap">
                    <Config.Label w={LABEL_WIDTH}>Y Axis</Config.Label>
                    <SegmentedControl
                        miw={130}
                        flex={1}
                        fz="sm"
                        data={[
                            {
                                value: 'left',
                                label: (
                                    <Group gap="xs" wrap="nowrap">
                                        <MantineIcon
                                            icon={IconAlignLeft}
                                            color="ldDark.8"
                                        />
                                        <Text inherit>Left</Text>
                                    </Group>
                                ),
                            },
                            {
                                value: 'right',
                                label: (
                                    <Group
                                        gap="xs"
                                        wrap="nowrap"
                                        justify="flex-end"
                                    >
                                        <Text inherit>Right</Text>
                                        <MantineIcon
                                            icon={IconAlignRight}
                                            color="ldDark.8"
                                        />
                                    </Group>
                                ),
                            },
                        ]}
                        value={whichYAxis === AxisSide.RIGHT ? 'right' : 'left'}
                        onChange={(value) =>
                            onAxisChange(
                                reference,
                                value === 'left'
                                    ? AxisSide.LEFT
                                    : AxisSide.RIGHT,
                            )
                        }
                    />
                </Flex>
                <Flex justify="flex-start" align="center" wrap="nowrap">
                    <Config.Label w={LABEL_WIDTH}>Value labels</Config.Label>
                    <CartesianChartValueLabelConfig
                        valueLabelPosition={
                            valueLabelPosition ??
                            ValueLabelPositionOptions.HIDDEN
                        }
                        onChangeValueLabelPosition={(position) =>
                            onValueLabelPositionChange(reference, position)
                        }
                    />
                </Flex>
            </Stack>
        </Stack>
    );
};
