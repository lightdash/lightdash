import { VizIndexType, type ChartKind } from '@lightdash/common';
import { TextInput, Group, Stack } from '@mantine/core';
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
import { CartesianChartXAxisDateFormatConfig } from './CartesianChartXAxisDateFormatConfig';

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

    const xAxisType = useVizSelector((state) =>
        cartesianChartSelectors.getXAxisType(state, selectedChartType),
    );
    const xAxisDateFormat = useVizSelector((state) =>
        cartesianChartSelectors.getXAxisDateFormat(state, selectedChartType),
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
        <Stack gap="xl" mt="sm">
            <Config>
                <Config.Section>
                    <Config.Heading>{`X-axis`}</Config.Heading>
                    <Group wrap="nowrap" w="100%">
                        <Config.Label>{`Label`}</Config.Label>
                        <TextInput
                            size="xs"
                            w="100%"
                            value={xAxisLabel || ''}
                            onChange={(e) =>
                                dispatch(
                                    actions.setXAxisLabel({
                                        label: e.target.value,
                                    }),
                                )
                            }
                        />
                    </Group>
                    {xAxisType === VizIndexType.TIME && (
                        <Config.Group>
                            <Config.Label>{`Format`}</Config.Label>
                            <CartesianChartXAxisDateFormatConfig
                                dateFormat={xAxisDateFormat}
                                onChangeDateFormat={(value) => {
                                    dispatch(
                                        actions.setXAxisDateFormat({
                                            dateFormat: value,
                                        }),
                                    );
                                }}
                            />
                        </Config.Group>
                    )}
                </Config.Section>
            </Config>
            {leftYAxisFields.length > 0 && (
                <Config>
                    <Config.Section>
                        <Config.Heading>{`Y-axis ${
                            rightYAxisFields.length > 0 ? '(left)' : ''
                        }`}</Config.Heading>
                        <Group wrap="nowrap" w="100%">
                            <Config.Label>{`Label`}</Config.Label>
                            <TextInput
                                size="xs"
                                w="100%"
                                value={yAxisLabels[0] || ''}
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

                        <CartesianChartFormatConfig
                            axis={currentConfig?.display?.yAxis?.[0]}
                            onChangeFormatOption={(path, value) => {
                                dispatch(
                                    actions.setYAxisFormatOption({
                                        index: 0,
                                        path,
                                        value,
                                    }),
                                );
                            }}
                        />
                    </Config.Section>
                </Config>
            )}
            {rightYAxisFields.length > 0 && (
                <Config>
                    <Config.Section>
                        <Config.Heading>{`Y-axis (right)`}</Config.Heading>
                        <Group wrap="nowrap" w="100%">
                            <Config.Label>{`Label`}</Config.Label>
                            <TextInput
                                size="xs"
                                w="100%"
                                value={yAxisLabels[1] || ''}
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

                        <CartesianChartFormatConfig
                            axis={currentConfig?.display?.yAxis?.[1]}
                            onChangeFormatOption={(path, value) => {
                                dispatch(
                                    actions.setYAxisFormatOption({
                                        index: 1,
                                        path,
                                        value,
                                    }),
                                );
                            }}
                        />
                    </Config.Section>
                </Config>
            )}
        </Stack>
    );
};
