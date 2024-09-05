import {
    ECHARTS_DEFAULT_COLORS,
    friendlyName,
    VizIndexType,
    type ChartKind,
} from '@lightdash/common';
import { Group, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { IconAlignLeft, IconAlignRight } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import MantineIcon from '../../common/MantineIcon';
import ColorSelector from '../../VisualizationConfigs/ColorSelector';
import { Config } from '../../VisualizationConfigs/common/Config';
import {
    useVizDispatch,
    useVizSelector,
    type CartesianChartActionsType,
} from '../store';
import { selectCurrentCartesianChartState } from '../store/selectors';
import { CartesianChartFormatConfig } from './CartesianChartFormatConfig';
import {
    CartesianChartSeries,
    type ConfigurableSeries,
} from './CartesianChartSeries';

export const CartesianChartStyling = ({
    selectedChartType,
    actions,
}: {
    selectedChartType: ChartKind;
    actions: CartesianChartActionsType;
}) => {
    const { data: org } = useOrganization();
    const colors = org?.chartColors ?? ECHARTS_DEFAULT_COLORS;
    const dispatch = useVizDispatch();

    const currentConfig = useVizSelector((state) =>
        selectCurrentCartesianChartState(state, selectedChartType),
    );

    const series: ConfigurableSeries[] = useMemo(() => {
        if (
            !currentConfig?.config?.fieldConfig?.y ||
            currentConfig?.config?.fieldConfig?.y.length <= 1
        ) {
            return [];
        }
        return currentConfig?.config?.fieldConfig?.y.map((f, index) => {
            const seriesFormat = Object.values(
                currentConfig?.config?.display?.series || {},
            ).find((s) => s.yAxisIndex === index)?.format;
            const seriesLabel =
                Object.values(
                    currentConfig?.config?.display?.series || {},
                ).find((s) => s.yAxisIndex === index)?.label ??
                friendlyName(`${f.reference}_${f.aggregation}`);

            const seriesColor = Object.values(
                currentConfig?.config?.display?.series || {},
            ).find((s) => s.yAxisIndex === index)?.color;
            return {
                reference: f.reference,
                format: seriesFormat,
                label: seriesLabel,
                color: seriesColor ?? colors[index],
            };
        });
    }, [
        colors,
        currentConfig?.config?.display?.series,
        currentConfig?.config?.fieldConfig?.y,
    ]);

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
    const yAxisLabelColor = useMemo(
        () =>
            currentConfig?.config?.fieldConfig?.y?.[0]?.reference &&
            currentConfig?.config?.display?.series?.[
                currentConfig.config.fieldConfig?.y[0].reference
            ]?.color,

        [currentConfig],
    );

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
                                    type: VizIndexType.CATEGORY,
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
                        <Group>
                            {series.length === 0 && (
                                <ColorSelector
                                    color={yAxisLabelColor ?? colors[0]}
                                    onColorChange={(color) => {
                                        if (
                                            !currentConfig?.config?.fieldConfig
                                                ?.y[0].reference
                                        )
                                            return;
                                        dispatch(
                                            actions.setSeriesColor({
                                                color,
                                                reference:
                                                    currentConfig?.config
                                                        ?.fieldConfig?.y[0]
                                                        .reference,
                                            }),
                                        );
                                    }}
                                    swatches={colors}
                                />
                            )}
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
                        </Group>
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
            {series.length > 0 && (
                <CartesianChartSeries
                    selectedChartType={selectedChartType}
                    actions={actions}
                    series={series}
                />
            )}
        </Stack>
    );
};
