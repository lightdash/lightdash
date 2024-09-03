import {
    ECHARTS_DEFAULT_COLORS,
    type CartesianChartDisplay,
    type ChartKind,
    type VizChartLayout,
} from '@lightdash/common';
import { Group, Stack, TextInput, Tooltip } from '@mantine/core';
import { IconBrush } from '@tabler/icons-react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import MantineIcon from '../../common/MantineIcon';
import ColorSelector from '../../VisualizationConfigs/ColorSelector';
import { Config } from '../../VisualizationConfigs/common/Config';
import { useVizDispatch, type CartesianChartActionsType } from '../store';
import { CartesianChartFormatConfig } from './CartesianChartFormatConfig';

export type ConfigurableSeries = {
    reference: VizChartLayout['y'][number]['reference'];
    format: NonNullable<CartesianChartDisplay['series']>[number]['format'];
    label: NonNullable<CartesianChartDisplay['series']>[number]['label'];
    color: NonNullable<CartesianChartDisplay['series']>[number]['color'];
};

type SeriesColorProps = {
    selectedChartType: ChartKind;
    actions: CartesianChartActionsType;
    series: ConfigurableSeries[];
};

export const CartesianChartSeries: React.FC<SeriesColorProps> = ({
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
                    {Object.entries(series).map(
                        ([reference, { label, color, format }], index) => (
                            <Group
                                key={reference}
                                spacing="xs"
                                noWrap
                                position="apart"
                            >
                                <Group>
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
                                                }),
                                            );
                                        }}
                                    />
                                </Group>
                                <Group spacing="xs">
                                    <Tooltip
                                        label="Format"
                                        variant="xs"
                                        withinPortal
                                    >
                                        <MantineIcon
                                            color="gray.5"
                                            icon={IconBrush}
                                        />
                                    </Tooltip>
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
                                </Group>
                            </Group>
                        ),
                    )}
                </Stack>
            </Config.Section>
        </Config>
    );
};
