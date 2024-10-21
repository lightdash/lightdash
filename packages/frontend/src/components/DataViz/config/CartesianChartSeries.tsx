import {
    ECHARTS_DEFAULT_COLORS,
    type CartesianChartDisplay,
    type ChartKind,
    type PivotChartLayout,
} from '@lightdash/common';
import { Group, Stack, TextInput } from '@mantine/core';
import { useAppDispatch as useVizDispatch } from '../../../features/sqlRunner/store/hooks';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import ColorSelector from '../../VisualizationConfigs/ColorSelector';
import { Config } from '../../VisualizationConfigs/common/Config';
import { type BarChartActionsType } from '../store/barChartSlice';
import { type LineChartActionsType } from '../store/lineChartSlice';
import { CartesianChartFormatConfig } from './CartesianChartFormatConfig';
import { CartesianChartTypeConfig } from './CartesianChartTypeConfig';

export type ConfigurableSeries = {
    reference: PivotChartLayout['y'][number]['reference'];
} & Pick<
    NonNullable<CartesianChartDisplay['series']>[number],
    'format' | 'label' | 'color' | 'type'
>;

type SeriesColorProps = {
    selectedChartType: ChartKind;
    actions: BarChartActionsType | LineChartActionsType;
    series: ConfigurableSeries[];
};

export const CartesianChartSeries: React.FC<SeriesColorProps> = ({
    selectedChartType,
    actions,
    series,
}) => {
    const { data: org } = useOrganization();
    const colors = org?.chartColors ?? ECHARTS_DEFAULT_COLORS;
    const dispatch = useVizDispatch();

    return (
        <Config>
            <Config.Section>
                <Config.Heading>Series</Config.Heading>
                <Stack spacing="xs">
                    {series.map(
                        ({ reference, label, color, type, format }, index) => (
                            <Stack key={reference} spacing="xs">
                                <Stack
                                    pl="sm"
                                    spacing="xs"
                                    sx={(theme) => ({
                                        borderLeft: `1px solid ${theme.colors.gray[2]}`,
                                    })}
                                >
                                    <Config.Subheading>
                                        {reference}
                                    </Config.Subheading>
                                    <Config.Group>
                                        <Config.Label>Label</Config.Label>

                                        <Group spacing="two" noWrap>
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
                                                            label: e.target
                                                                .value,
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
                                            canSelectDifferentTypeFromBaseChart={
                                                true
                                            }
                                            type={type ?? selectedChartType}
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
                                        <Config.Label>Format</Config.Label>

                                        <CartesianChartFormatConfig
                                            format={format}
                                            onChangeFormat={(value) => {
                                                dispatch(
                                                    actions.setSeriesFormat({
                                                        index,
                                                        format: value,
                                                        reference,
                                                    }),
                                                );
                                            }}
                                        />
                                    </Config.Group>
                                </Stack>
                            </Stack>
                        ),
                    )}
                </Stack>
            </Config.Section>
        </Config>
    );
};
