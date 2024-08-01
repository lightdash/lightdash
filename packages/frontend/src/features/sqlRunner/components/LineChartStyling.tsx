import { XLayoutType } from '@lightdash/common';
import { Select, Stack, TextInput } from '@mantine/core';
import debounce from 'lodash/debounce';
import { Config } from '../../../components/VisualizationConfigs/common/Config';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    setXAxisLabel,
    setYAxisLabel,
    setYAxisPosition,
} from '../store/lineChartSlice';

const DEBOUNCE_TIME = 500;

export const LineChartStyling = () => {
    const dispatch = useAppDispatch();

    const xAxisLabel = useAppSelector(
        (state) =>
            state.lineChartConfig.config?.display?.xAxis?.label ??
            state.lineChartConfig.config?.fieldConfig?.x?.reference,
    );

    const yAxisLabel = useAppSelector(
        (state) =>
            state.lineChartConfig.config?.display?.yAxis?.[0]?.label ??
            state.lineChartConfig.config?.fieldConfig?.y?.[0]?.reference,
    );
    const yAxisPosition = useAppSelector(
        (state) => state.lineChartConfig.config?.display?.yAxis?.[0]?.position,
    );
    const onXAxisLabelChange = debounce((label: string) => {
        dispatch(setXAxisLabel({ label, type: XLayoutType.CATEGORY }));
    }, DEBOUNCE_TIME);

    const onYAxisLabelChange = debounce((label: string) => {
        dispatch(setYAxisLabel({ index: 0, label }));
    }, DEBOUNCE_TIME);

    const onYAxisPositionChange = debounce((position: string | undefined) => {
        dispatch(setYAxisPosition({ index: 0, position }));
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
                    <Select
                        data={['left', 'right']}
                        defaultValue={yAxisPosition}
                        onChange={(value) =>
                            onYAxisPositionChange(value || undefined)
                        }
                        placeholder={'Change the y-axis position'}
                    />
                </Config.Section>
            </Config>
        </Stack>
    );
};
