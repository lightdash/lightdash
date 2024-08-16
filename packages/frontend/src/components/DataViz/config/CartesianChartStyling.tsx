import { IndexType, type ChartKind } from '@lightdash/common';
import { Group, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { IconAlignLeft, IconAlignRight } from '@tabler/icons-react';
import { type CartesianChartActionsType, useVizDispatch, useVizSelector } from '../store';
import { selectCurrentCartesianChartState } from '../store/selectors';
import { CartesianChartFormatConfig } from './CartesianChartFormatConfig';
import { useMemo } from 'react';
import MantineIcon from '../../common/MantineIcon';
import { Config } from '../../VisualizationConfigs/common/Config';

export const CartesianChartStyling = ({
    selectedChartType,
    actions,
}: {
    selectedChartType: ChartKind;
    actions: CartesianChartActionsType;
}) => {
    const dispatch = useVizDispatch();

    const currentConfig = useVizSelector((state) =>
        selectCurrentCartesianChartState(state, selectedChartType),
    );

    const series = useVizSelector((state) => {
        if (
            !state.barChartConfig.config?.fieldConfig?.y ||
            state.barChartConfig.config.fieldConfig.y.length <= 1
        ) {
            return [];
        }
        return state.barChartConfig.config.fieldConfig.y.map((f) => {
            const format =
                state.barChartConfig.config?.display?.series?.[f.reference]
                    ?.format;
            return {
                reference: f.reference,
                format,
            };
        });
    });

    const xAxisLabel = useMemo(() => {
        return (
            currentConfig?.config?.display?.xAxis?.label ??
            currentConfig?.config?.fieldConfig?.x?.reference
        );
    }, [currentConfig]);
    const yAxisLabel = useMemo(() => {
        return (
            currentConfig?.config?.display?.yAxis?.[0]?.label ??
            currentConfig?.config?.fieldConfig?.y?.[0]?.reference
        );
    }, [currentConfig]);
    const yAxisPosition = currentConfig?.config?.display?.yAxis?.[0]?.position;

    return (
        <Stack spacing="xs">
            <Config>
                <Config.Group>
                    <Config.Label>{`Stacking`}</Config.Label>
                    <SegmentedControl
                        radius="md"
                        disabled={!currentConfig?.config?.fieldConfig?.groupBy}
                        data={[
                            {
                                value: 'None',
                                label: 'None',
                            },
                            {
                                value: 'Stacked',
                                label: 'Stacked',
                            },
                        ]}
                        defaultValue={
                            currentConfig?.config?.display?.stack
                                ? 'Stacked'
                                : 'None'
                        }
                        onChange={(value) =>
                            dispatch(actions.setStacked(value === 'Stacked'))
                        }
                    />
                </Config.Group>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Heading>{`X-axis label`}</Config.Heading>

                    <TextInput
                        value={xAxisLabel}
                        radius="md"
                        onChange={(e) =>
                            dispatch(
                                actions.setXAxisLabel({
                                    label: e.target.value,
                                    type: IndexType.CATEGORY,
                                }),
                            )
                        }
                    />
                </Config.Section>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Heading>{`Y-axis`}</Config.Heading>
                    <Config.Group>
                        <Config.Label>{`Label`}</Config.Label>
                        <TextInput
                            value={yAxisLabel}
                            radius="md"
                            onChange={(e) =>
                                dispatch(
                                    actions.setYAxisLabel({
                                        index: 0,
                                        label: e.target.value,
                                    }),
                                )
                            }
                        />
                    </Config.Group>
                    {series.length < 1 && (
                        <Config.Group>
                            <Config.Label>{`Format`}</Config.Label>
                            <CartesianChartFormatConfig
                                format={
                                    currentConfig?.config?.display?.yAxis?.[0]
                                        ?.format
                                }
                                onChangeFormat={(value) => {
                                    dispatch(
                                        actions.setYAxisFormat({
                                            format: value,
                                        }),
                                    );
                                }}
                            />
                        </Config.Group>
                    )}
                    {series.length > 1 && (
                        <Config.Subheading>Series</Config.Subheading>
                    )}
                    {series.map((s, index) => (
                        <Config.Group key={index}>
                            <Config.Label>{`Series ${index + 1}`}</Config.Label>
                            <CartesianChartFormatConfig
                                format={s.format}
                                onChangeFormat={(value) => {
                                    dispatch(
                                        actions.setSeriesFormat({
                                            index,
                                            format: value,
                                            reference: s.reference,
                                        }),
                                    );
                                }}
                            />
                        </Config.Group>
                    ))}

                    <Config.Group>
                        <Config.Label>{`Position`}</Config.Label>
                        <SegmentedControl
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
                                            <MantineIcon
                                                icon={IconAlignRight}
                                            />
                                        </Group>
                                    ),
                                },
                            ]}
                            value={yAxisPosition}
                            onChange={(value) =>
                                dispatch(
                                    actions.setYAxisPosition({
                                        index: 0,
                                        position: value || undefined,
                                    }),
                                )
                            }
                        />
                    </Config.Group>
                </Config.Section>
            </Config>
        </Stack>
    );
};
