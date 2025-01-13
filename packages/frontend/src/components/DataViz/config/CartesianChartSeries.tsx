import {
    ECHARTS_DEFAULT_COLORS,
    friendlyName,
    getEChartsChartTypeFromChartKind,
    ValueLabelPositionOptions,
    type CartesianChartDisplay,
    type ChartKind,
    type PivotChartLayout,
} from '@lightdash/common';
import { Group, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { IconAlignLeft, IconAlignRight } from '@tabler/icons-react';
import { useMemo } from 'react';
import {
    useAppDispatch as useVizDispatch,
    useAppSelector,
} from '../../../features/sqlRunner/store/hooks';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import MantineIcon from '../../common/MantineIcon';
import ColorSelector from '../../VisualizationConfigs/ColorSelector';
import { Config } from '../../VisualizationConfigs/common/Config';
import { type BarChartActionsType } from '../store/barChartSlice';
import { type LineChartActionsType } from '../store/lineChartSlice';
import { selectCurrentCartesianChartState } from '../store/selectors';
import { CartesianChartTypeConfig } from './CartesianChartTypeConfig';
import { CartesianChartValueLabelConfig } from './CartesianChartValueLabelConfig';

type ConfigurableSeries = {
    reference: PivotChartLayout['y'][number]['reference'];
} & Pick<
    NonNullable<CartesianChartDisplay['series']>[number],
    'format' | 'label' | 'color' | 'type' | 'valueLabelPosition' | 'whichYAxis'
>;

export const CartesianChartSeries = ({
    selectedChartType,
    actions,
}: {
    selectedChartType: ChartKind;
    actions: BarChartActionsType | LineChartActionsType;
}) => {
    const { data: org } = useOrganization();
    const colors = org?.chartColors ?? ECHARTS_DEFAULT_COLORS;
    const dispatch = useVizDispatch();

    const currentConfig = useAppSelector((state) =>
        selectCurrentCartesianChartState(state, selectedChartType),
    );

    const series: ConfigurableSeries[] = useMemo(() => {
        if (!currentConfig?.fieldConfig?.y) {
            return [];
        }
        // Go through the selected fields
        return currentConfig?.fieldConfig?.y.map((f, index) => {

            // Look for display associated with each selected field
            const foundSeries = Object.values(
                currentConfig?.display?.series || {},
            ).find((s) => s.yAxisIndex === index);

            const seriesFormat = foundSeries?.format;
            const seriesLabel = foundSeries?.label;
            const seriesColor = foundSeries?.color;
            const seriesType = foundSeries?.type;
            const seriesValueLabelPosition = foundSeries?.valueLabelPosition;
            const seriesWhichYAxis = foundSeries?.whichYAxis;
            return {
                reference: f.reference,
                format: seriesFormat,
                label:
                    seriesLabel ??
                    friendlyName(`${f.reference}_${f.aggregation}`),
                color: seriesColor ?? colors[index],
                type: seriesType,
                valueLabelPosition: seriesValueLabelPosition,
                whichYAxis: seriesWhichYAxis,
            };
        });
    }, [colors, currentConfig?.display?.series, currentConfig?.fieldConfig?.y]);

    return (
        <Stack mt="sm">
            {series.length === 0 && (
                <Text>No series found. Add a metric to create a series.</Text>
            )}
            {series.length > 0 && (
                <Config>
                    <Config.Group>
                        <Config.Label>{`Stacking`}</Config.Label>
                        <SegmentedControl
                            radius="md"
                            disabled={series.length === 1}
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
                                currentConfig?.display?.stack
                                    ? 'Stacked'
                                    : 'None'
                            }
                            onChange={(value) =>
                                dispatch(
                                    actions.setStacked(value === 'Stacked'),
                                )
                            }
                        />
                    </Config.Group>
                </Config>
            )}
            {series.map(
                (
                    {
                        reference,
                        label,
                        color,
                        type,
                        whichYAxis,
                        valueLabelPosition,
                    },
                    index,
                ) => (
                    <Stack key={reference} spacing="xs">
                        <Stack
                            pl="sm"
                            spacing="xs"
                            sx={(theme) => ({
                                borderLeft: `1px solid ${theme.colors.gray[2]}`,
                            })}
                        >
                            <Config.Subheading>{reference}</Config.Subheading>
                            <Config.Group>
                                <Config.Label>Label</Config.Label>

                                <Group spacing="xs" noWrap>
                                    <ColorSelector
                                        color={color ?? colors[index]}
                                        onColorChange={(c) => {
                                            dispatch(
                                                actions.setSeriesColor({
                                                    index,
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
                                                    index,
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
                                        getEChartsChartTypeFromChartKind(
                                            selectedChartType,
                                        )
                                    }
                                    onChangeType={(
                                        value: NonNullable<
                                            CartesianChartDisplay['series']
                                        >[number]['type'],
                                    ) => {
                                        dispatch(
                                            actions.setSeriesChartType({
                                                index,
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
                                                    <MantineIcon
                                                        icon={IconAlignLeft}
                                                    />
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
                                    value={whichYAxis === 1 ? 'right' : 'left'}
                                    onChange={(value) =>
                                        dispatch(
                                            actions.setSeriesYAxis({
                                                index,
                                                // whichYAxis is an index, but this input uses string values
                                                whichYAxis:
                                                    value === 'left' ? 0 : 1,
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
                                            actions.setSeriesValueLabelPosition(
                                                {
                                                    index,
                                                    valueLabelPosition: value,
                                                    reference,
                                                },
                                            ),
                                        );
                                    }}
                                />
                            </Config.Group>
                        </Stack>
                    </Stack>
                ),
            )}
        </Stack>
    );
};
