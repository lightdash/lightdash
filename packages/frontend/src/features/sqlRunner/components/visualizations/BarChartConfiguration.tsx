import { type BarChartConfig } from '@lightdash/common';
import { Stack, Title } from '@mantine/core';
import debounce from 'lodash/debounce';
import { type FC } from 'react';
import { EditableText } from '../../../../components/VisualizationConfigs/common/EditableText';

type BarChartConfigurationProps = {
    value: BarChartConfig;
    onChange: (config: BarChartConfig) => void;
};

const DEBOUNCE_TIME = 500;

const BarChartConfiguration: FC<BarChartConfigurationProps> = ({
    value,
    onChange,
}) => {
    const onXAxisLabelChange = debounce((label: string) => {
        onChange({
            ...value,
            axes: {
                ...value.axes,
                x: {
                    ...value.axes.x,
                    label,
                },
            },
        });
    }, DEBOUNCE_TIME);
    const onYAxisLabelChange = debounce((label: string) => {
        onChange({
            ...value,
            axes: {
                ...value.axes,
                y: [
                    {
                        ...value.axes.y[0],
                        label,
                    },
                ],
            },
        });
    }, DEBOUNCE_TIME);
    const onSeriesLabelChange = debounce((index: number, label: string) => {
        onChange({
            ...value,
            series: value.series.map((series, i) =>
                i === index ? { ...series, name: label } : series,
            ),
        });
    }, DEBOUNCE_TIME);
    return (
        <Stack spacing="xs">
            <Title order={6} fz="sm" c="gray.6">
                X axis
            </Title>
            <EditableText
                defaultValue={value.axes.x.label}
                onChange={(e) => onXAxisLabelChange(e.target.value)}
            />
            <Title order={6} fz="sm" c="gray.6">
                Y axis
            </Title>
            <EditableText
                defaultValue={value.axes.y[0]?.label}
                onChange={(e) => onYAxisLabelChange(e.target.value)}
            />
            <Title order={6} fz="sm" c="gray.6">
                Series
            </Title>
            {value.series.map(({ name, reference }, index) => (
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
