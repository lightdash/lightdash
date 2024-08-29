import { ECHARTS_DEFAULT_COLORS, type ChartKind } from '@lightdash/common';
import { Group, Stack, TextInput } from '@mantine/core';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import ColorSelector from '../../VisualizationConfigs/ColorSelector';
import { Config } from '../../VisualizationConfigs/common/Config';
import {
    useVizDispatch,
    useVizSelector,
    type CartesianChartActionsType,
} from '../store';
import { selectCurrentCartesianChartState } from '../store/selectors';
import { CartesianChartFormatConfig } from './CartesianChartFormatConfig';

type SeriesColorProps = {
    selectedChartType: ChartKind;
    actions: CartesianChartActionsType;
};

export const CartesianChartSeries: React.FC<SeriesColorProps> = ({
    selectedChartType,
    actions,
}) => {
    const { data: org } = useOrganization();
    const colors = org?.chartColors ?? ECHARTS_DEFAULT_COLORS;
    const dispatch = useVizDispatch();
    const currentConfig = useVizSelector((state) =>
        selectCurrentCartesianChartState(state, selectedChartType),
    );

    const serieFields = currentConfig?.config?.fieldConfig?.y || [];
    const series = currentConfig?.config?.display?.series || {};

    return (
        <Config>
            <Config.Section>
                <Config.Heading>Series</Config.Heading>
                <Stack spacing="xs">
                    {serieFields.map((field, index) => (
                        <Group key={field.reference} spacing="xs" noWrap>
                            <TextInput
                                value={
                                    series[field.reference]?.label ||
                                    field.reference
                                }
                                onChange={(e) => {
                                    //TODO implement debounce?
                                    dispatch(
                                        actions.setSeriesLabel({
                                            label: e.target.value,
                                            reference: field.reference,
                                        }),
                                    );
                                }}
                            />
                            <ColorSelector
                                color={
                                    series[field.reference]?.color ||
                                    colors[index]
                                }
                                onColorChange={(color) => {
                                    dispatch(
                                        actions.setSeriesColor({
                                            index,
                                            color,
                                            reference: field.reference,
                                        }),
                                    );
                                }}
                                swatches={colors}
                            />

                            <CartesianChartFormatConfig
                                format={series[field.reference]?.format}
                                onChangeFormat={(value) => {
                                    dispatch(
                                        actions.setSeriesFormat({
                                            index,
                                            format: value,
                                            reference: field.reference,
                                        }),
                                    );
                                }}
                            />
                        </Group>
                    ))}
                </Stack>
            </Config.Section>
        </Config>
    );
};
