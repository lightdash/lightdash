import { type ChartKind } from '@lightdash/common';
import { Stack, TextInput } from '@mantine/core';
import { useMemo } from 'react';
import {
    useAppDispatch as useVizDispatch,
    useAppSelector as useVizSelector,
} from '../../../features/sqlRunner/store/hooks';
import { Config } from '../../VisualizationConfigs/common/Config';
import { type BarChartActionsType } from '../store/barChartSlice';
import { type LineChartActionsType } from '../store/lineChartSlice';
import { selectCurrentCartesianChartState } from '../store/selectors';

export const CartesianChartStyling = ({
    selectedChartType,
    actions,
}: {
    selectedChartType: ChartKind;
    actions: BarChartActionsType | LineChartActionsType;
}) => {
    const dispatch = useVizDispatch();

    const currentConfig = useVizSelector((state) =>
        selectCurrentCartesianChartState(state, selectedChartType),
    );

    const xAxisLabel = useMemo(() => {
        return (
            currentConfig?.display?.xAxis?.label ??
            currentConfig?.fieldConfig?.x?.reference
        );
    }, [currentConfig]);
    const yAxisLabel = useMemo(() => {
        return (
            currentConfig?.display?.yAxis?.[0]?.label ??
            currentConfig?.fieldConfig?.y?.[0]?.reference
        );
    }, [currentConfig]);

    return (
        <Stack spacing="xs">
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
                                }),
                            )
                        }
                    />
                </Config.Section>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Heading>{`Y-axis label`}</Config.Heading>

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
                </Config.Section>
            </Config>
        </Stack>
    );
};
