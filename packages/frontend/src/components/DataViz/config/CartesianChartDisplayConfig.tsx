import { type ChartKind } from '@lightdash/common';
import { Group, Stack, TextInput } from '@mantine/core';
import {
    useAppDispatch as useVizDispatch,
    useAppSelector as useVizSelector,
} from '../../../features/sqlRunner/store/hooks';
import { Config } from '../../VisualizationConfigs/common/Config';
import { type BarChartActionsType } from '../store/barChartSlice';
import { type LineChartActionsType } from '../store/lineChartSlice';
import {
    cartesianChartSelectors,
    selectCurrentCartesianChartState,
} from '../store/selectors';
import { CartesianChartFormatConfig } from './CartesianChartFormatConfig';

export const CartesianChartDisplayConfig = ({
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

    const xAxisLabel = useVizSelector((state) =>
        cartesianChartSelectors.getXAxisLabel(state, selectedChartType),
    );

    const leftYAxisFields = useVizSelector((state) =>
        cartesianChartSelectors.getLeftYAxisFields(state, selectedChartType),
    );
    const rightYAxisFields = useVizSelector((state) =>
        cartesianChartSelectors.getRightYAxisFields(state, selectedChartType),
    );

    const yAxisLabels = useVizSelector((state) =>
        cartesianChartSelectors.getYAxisLabels(state, selectedChartType),
    );

    return (
        <Stack spacing="xl" mt="sm">
            <Config>
                <Config.Section>
                    <Config.Heading>{`X-axis label`}</Config.Heading>
                    <TextInput
                        value={xAxisLabel || ''}
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
            {leftYAxisFields.length > 0 && (
                <Config>
                    <Config.Section>
                        <Config.Heading>{`Y-axis ${
                            rightYAxisFields.length > 0 ? '(left)' : ''
                        }`}</Config.Heading>
                        <Group noWrap w="100%">
                            <Config.Label>{`Label`}</Config.Label>
                            <TextInput
                                w="100%"
                                value={yAxisLabels[0] || ''}
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

                        <Config.Group>
                            <Config.Label>{`Format`}</Config.Label>
                            <CartesianChartFormatConfig
                                format={
                                    currentConfig?.display?.yAxis?.[0]?.format
                                }
                                onChangeFormat={(value) => {
                                    dispatch(
                                        actions.setYAxisFormat({
                                            format: value,
                                            index: 0,
                                        }),
                                    );
                                }}
                            />
                        </Config.Group>
                    </Config.Section>
                </Config>
            )}
            {rightYAxisFields.length > 0 && (
                <Config>
                    <Config.Section>
                        <Config.Heading>{`Y-axis (right)`}</Config.Heading>
                        <Group noWrap w="100%">
                            <Config.Label>{`Label`}</Config.Label>
                            <TextInput
                                w="100%"
                                value={yAxisLabels[1] || ''}
                                radius="md"
                                onChange={(e) =>
                                    dispatch(
                                        actions.setYAxisLabel({
                                            index: 1,
                                            label: e.target.value,
                                        }),
                                    )
                                }
                            />
                        </Group>

                        <Config.Group>
                            <Config.Label>{`Format`}</Config.Label>
                            <CartesianChartFormatConfig
                                format={
                                    currentConfig?.display?.yAxis?.[1]?.format
                                }
                                onChangeFormat={(value) => {
                                    dispatch(
                                        actions.setYAxisFormat({
                                            format: value,
                                            index: 1,
                                        }),
                                    );
                                }}
                            />
                        </Config.Group>
                    </Config.Section>
                </Config>
            )}
        </Stack>
    );
};
