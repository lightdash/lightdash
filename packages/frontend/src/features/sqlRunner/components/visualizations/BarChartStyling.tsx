import { XLayoutType } from '@lightdash/common';
import { Stack, TextInput } from '@mantine/core';
import debounce from 'lodash/debounce';
import { Config } from '../../../../components/VisualizationConfigs/common/Config';
import { setXAxisLabel, setYAxisLabel } from '../../store/barChartSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';

const DEBOUNCE_TIME = 500;

export const BarChartStyling = () => {
    const dispatch = useAppDispatch();

    const xAxisLabel = useAppSelector(
        (state) =>
            state.barChartConfig.config?.display?.xAxis?.label ??
            state.barChartConfig.config?.fieldConfig?.x?.reference,
    );

    const yAxisLabel = useAppSelector(
        (state) =>
            state.barChartConfig.config?.display?.yAxis?.[0]?.label ??
            state.barChartConfig.config?.fieldConfig?.y?.[0]?.reference,
    );

    const onXAxisLabelChange = debounce((label: string) => {
        dispatch(setXAxisLabel({ label, type: XLayoutType.CATEGORY }));
    }, DEBOUNCE_TIME);

    const onYAxisLabelChange = debounce((label: string) => {
        dispatch(setYAxisLabel({ index: 0, label }));
    }, DEBOUNCE_TIME);

    return (
        <Stack spacing="xs">
            <Config>
                <Config.Section>
                    <Config.Heading>{`X-axis label`}</Config.Heading>

                    <TextInput
                        defaultValue={xAxisLabel}
                        radius="md"
                        onChange={(e) => onXAxisLabelChange(e.target.value)}
                    />
                </Config.Section>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Heading>{`Y-axis label`}</Config.Heading>

                    <TextInput
                        defaultValue={yAxisLabel}
                        radius="md"
                        onChange={(e) => onYAxisLabelChange(e.target.value)}
                    />
                </Config.Section>
            </Config>
        </Stack>
    );
};
