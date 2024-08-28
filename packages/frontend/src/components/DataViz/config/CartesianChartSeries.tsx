import { ECHARTS_DEFAULT_COLORS, type ChartKind } from '@lightdash/common';
import { ColorInput, Group, Stack, Text } from '@mantine/core';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { Config } from '../../VisualizationConfigs/common/Config';
import {
    useVizDispatch,
    useVizSelector,
    type CartesianChartActionsType,
} from '../store';
import { selectCurrentCartesianChartState } from '../store/selectors';

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
    const series = currentConfig?.config?.fieldConfig?.y || [];
    const seriesColors = currentConfig?.config?.display?.series || {};
    return (
        <Config>
            <Config.Section>
                <Config.Heading>Series Colors</Config.Heading>
                <Stack spacing="xs">
                    {series.map((field, index) => (
                        <Group key={field.reference} spacing="xs" noWrap>
                            <Text size="sm" style={{ flex: 1 }}>
                                {field.reference}
                            </Text>
                            <ColorInput
                                value={
                                    seriesColors[field.reference]?.color ||
                                    colors[index]
                                }
                                onChange={(color) => {
                                    dispatch(
                                        actions.setSeriesColor({
                                            index,
                                            color,
                                            reference: field.reference,
                                        }),
                                    );
                                }}
                                sx={{ width: '200px' }}
                            />
                        </Group>
                    ))}
                </Stack>
            </Config.Section>
        </Config>
    );
};
