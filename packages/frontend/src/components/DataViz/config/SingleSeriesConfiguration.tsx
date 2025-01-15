import {
    getEChartsChartTypeFromChartKind,
    ValueLabelPositionOptions,
    type CartesianChartDisplay,
    type ChartKind,
} from '@lightdash/common';
import { Group, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { IconAlignLeft, IconAlignRight } from '@tabler/icons-react';
import MantineIcon from '../../common/MantineIcon';
import ColorSelector from '../../VisualizationConfigs/ColorSelector';
import { Config } from '../../VisualizationConfigs/common/Config';
import { CartesianChartTypeConfig } from './CartesianChartTypeConfig';
import { CartesianChartValueLabelConfig } from './CartesianChartValueLabelConfig';

type SingleSeriesConfigurationProps = {
    reference: string;
    seriesIndex: number;
    color: string | undefined;
    colors: string[];
    label?: string;
    type: NonNullable<CartesianChartDisplay['series']>[number]['type'];
    whichYAxis?: number;
    valueLabelPosition: ValueLabelPositionOptions | undefined;
    selectedChartType: ChartKind;
    dispatch: any;
    actions: any;
};

export const SingleSeriesConfiguration = ({
    reference,
    seriesIndex,
    color,
    colors,
    label,
    type,
    whichYAxis = 0,
    valueLabelPosition,
    selectedChartType,
    dispatch,
    actions,
}: SingleSeriesConfigurationProps) => {
    return (
        <Stack key={reference} spacing="xs">
            <Stack
                pl="sm"
                spacing="xs"
                sx={(theme) => ({
                    borderLeft: `1px solid ${theme.colors.gray[2]}`,
                    backgroundColor: theme.colors.gray[1],
                    borderRadius: theme.radius.md,
                    padding: theme.spacing.xs,
                })}
            >
                <Config.Subheading>{reference}</Config.Subheading>
                <Config.Group>
                    <Config.Label>Label</Config.Label>
                    <Group spacing="xs" noWrap>
                        <ColorSelector
                            color={color ?? colors[seriesIndex]}
                            onColorChange={(c) => {
                                dispatch(
                                    actions.setSeriesColor({
                                        index: seriesIndex,
                                        color: c,
                                        reference,
                                    }),
                                );
                            }}
                            swatches={colors}
                        />
                        <TextInput
                            radius="md"
                            value={label}
                            onChange={(e) => {
                                dispatch(
                                    actions.setSeriesLabel({
                                        label: e.target.value,
                                        reference,
                                        index: seriesIndex,
                                    }),
                                );
                            }}
                        />
                    </Group>
                </Config.Group>
                <Config.Group>
                    <Config.Label>Chart Type</Config.Label>
                    <CartesianChartTypeConfig
                        canSelectDifferentTypeFromBaseChart={true}
                        type={
                            type ??
                            getEChartsChartTypeFromChartKind(selectedChartType)
                        }
                        onChangeType={(
                            value: NonNullable<
                                CartesianChartDisplay['series']
                            >[number]['type'],
                        ) => {
                            dispatch(
                                actions.setSeriesChartType({
                                    index: seriesIndex,
                                    type: value,
                                    reference,
                                }),
                            );
                        }}
                    />
                </Config.Group>
                <Config.Group>
                    <Config.Label>Y Axis</Config.Label>
                    <SegmentedControl
                        sx={{ alignSelf: 'center' }}
                        radius="md"
                        data={[
                            {
                                value: 'left',
                                label: (
                                    <Group spacing="xs" noWrap>
                                        <MantineIcon icon={IconAlignLeft} />
                                        <Text>Left</Text>
                                    </Group>
                                ),
                            },
                            {
                                value: 'right',
                                label: (
                                    <Group spacing="xs" noWrap>
                                        <Text>Right</Text>
                                        <MantineIcon icon={IconAlignRight} />
                                    </Group>
                                ),
                            },
                        ]}
                        value={whichYAxis === 1 ? 'right' : 'left'}
                        onChange={(value) =>
                            dispatch(
                                actions.setSeriesYAxis({
                                    index: seriesIndex,
                                    whichYAxis: value === 'left' ? 0 : 1,
                                    reference,
                                }),
                            )
                        }
                    />
                </Config.Group>
                <Config.Group>
                    <Config.Label>Value labels</Config.Label>
                    <CartesianChartValueLabelConfig
                        valueLabelPosition={
                            valueLabelPosition ??
                            ValueLabelPositionOptions.HIDDEN
                        }
                        onChangeValueLabelPosition={(value) => {
                            dispatch(
                                actions.setSeriesValueLabelPosition({
                                    index: seriesIndex,
                                    valueLabelPosition: value,
                                    reference,
                                }),
                            );
                        }}
                    />
                </Config.Group>
            </Stack>
        </Stack>
    );
};
