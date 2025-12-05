import {
    AxisSide,
    ValueLabelPositionOptions,
    getEChartsChartTypeFromChartKind,
    type CartesianChartDisplay,
    type ChartKind,
} from '@lightdash/common';
import {
    Box,
    Flex,
    Group,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { IconAlignLeft, IconAlignRight } from '@tabler/icons-react';
import ColorSelector from '../../VisualizationConfigs/ColorSelector';
import { Config } from '../../VisualizationConfigs/common/Config';
import MantineIcon from '../../common/MantineIcon';
import { CartesianChartTypeConfig } from './CartesianChartTypeConfig';
import { CartesianChartValueLabelConfig } from './CartesianChartValueLabelConfig';

const LABEL_WIDTH = 120;

type SingleSeriesConfigurationProps = {
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
        <Stack key={reference} spacing="xs">
            <Stack
                pl="sm"
                spacing="xs"
                sx={(theme) => ({
                    backgroundColor: theme.colors.ldGray[0],
                    borderRadius: theme.radius.md,
                    padding: theme.spacing.xs,
                })}
            >
                <Config.Subheading>{reference}</Config.Subheading>
                <Flex justify="flex-start" align="center" wrap="nowrap">
                    <Config.Label w={LABEL_WIDTH}>Label</Config.Label>
                    <Group
                        spacing="xs"
                        position="left"
                        noWrap
                        grow
                        style={{ flex: 3 }}
                    >
                        <Box
                            sx={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'row',
                                alignItems: 'center',
                            }}
                        >
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
                                maw="100%"
                                radius="md"
                                value={label}
                                onChange={(e) =>
                                    onLabelChange(reference, e.target.value)
                                }
                                sx={(theme) => ({
                                    input: {
                                        border: `1px solid ${theme.colors.ldGray[2]}`,
                                    },
                                    flex: 1,
                                    marginLeft: theme.spacing.xs,
                                })}
                            />
                        </Box>
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
                        sx={{ minWidth: '130px', flex: 1 }}
                        radius="md"
                        data={[
                            {
                                value: 'left',
                                label: (
                                    <Group spacing="xs" noWrap>
                                        <MantineIcon
                                            icon={IconAlignLeft}
                                            color="ldDark.8"
                                        />
                                        <Text>Left</Text>
                                    </Group>
                                ),
                            },
                            {
                                value: 'right',
                                label: (
                                    <Group spacing="xs" noWrap position="right">
                                        <Text>Right</Text>
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
