import { Stack, Title } from '@mantine/core';
import debounce from 'lodash/debounce';
import { type FC } from 'react';
import { EditableText } from '../../../components/VisualizationConfigs/common/EditableText';
import {
    setSeriesLabel,
    setXAxisLabel,
    setYAxisLabel,
} from '../store/barChartSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';

const DEBOUNCE_TIME = 500;

const BarChartConfiguration: FC = ({}) => {
    const dispatch = useAppDispatch();

    const barChartConfig = useAppSelector(
        (state) => state.barChartConfig.config,
    );

    const onXAxisLabelChange = debounce((label: string) => {
        dispatch(setXAxisLabel(label));
    }, DEBOUNCE_TIME);
    const onYAxisLabelChange = debounce((label: string) => {
        dispatch(setYAxisLabel(label));
    }, DEBOUNCE_TIME);
    const onSeriesLabelChange = debounce((index: number, label: string) => {
        dispatch(setSeriesLabel({ index, label }));
    }, DEBOUNCE_TIME);

    if (!barChartConfig) {
        return null;
    }

    return (
        <Stack spacing="xs">
            <Title order={6} fz="sm" c="gray.6">
                X axis
            </Title>
            <EditableText
                defaultValue={barChartConfig?.axes?.x.label}
                onChange={(e) => onXAxisLabelChange(e.target.value)}
            />
            <Title order={6} fz="sm" c="gray.6">
                Y axis
            </Title>
            <EditableText
                defaultValue={barChartConfig?.axes?.y[0]?.label}
                onChange={(e) => onYAxisLabelChange(e.target.value)}
            />
            <Title order={6} fz="sm" c="gray.6">
                Series
            </Title>
            {barChartConfig?.series?.map(({ name, reference }, index) => (
                <EditableText
                    key={reference}
                    defaultValue={name ?? reference}
                    onChange={(e) => onSeriesLabelChange(index, e.target.value)}
                />
            ))}
        </Stack>
    );
};

export default BarChartConfiguration;
