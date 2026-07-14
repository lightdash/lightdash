import { CartesianSeriesType } from '@lightdash/common';
import { type SelectProps, Select } from '@mantine-8/core';
import {
    IconChartArea,
    IconChartAreaLine,
    IconChartBar,
    IconChartDots,
    IconChartLine,
} from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../common/MantineIcon';

const CHART_TYPE_OPTIONS = [
    { value: CartesianSeriesType.BAR, label: 'Bar', icon: IconChartBar },
    { value: CartesianSeriesType.LINE, label: 'Line', icon: IconChartLine },
    { value: CartesianSeriesType.AREA, label: 'Area', icon: IconChartArea },
    {
        value: CartesianSeriesType.SCATTER,
        label: 'Scatter',
        icon: IconChartDots,
    },
];

type Props = {
    chartValue: string;
    showMixed: boolean;
    showLabel?: boolean;
} & Pick<SelectProps, 'onChange'>;

export const ChartTypeSelect: FC<Props> = ({
    chartValue,
    onChange,
    showMixed,
    showLabel = true,
}) => {
    const options = useMemo(
        () => [
            ...CHART_TYPE_OPTIONS,
            ...(showMixed
                ? [{ value: 'mixed', label: 'Mixed', icon: IconChartAreaLine }]
                : []),
        ],
        [showMixed],
    );

    const selectedChartIcon = useMemo(
        () =>
            CHART_TYPE_OPTIONS.find((type) => type.value === chartValue)?.icon,
        [chartValue],
    );

    return (
        <Select
            allowDeselect={false}
            label={showLabel && 'Type'}
            value={chartValue}
            data={options}
            onChange={onChange}
            renderOption={({ option }) => {
                const chartType = options.find(
                    ({ value }) => value === option.value,
                );
                return chartType ? (
                    <MantineIcon icon={chartType.icon} />
                ) : (
                    option.label
                );
            }}
            leftSection={
                selectedChartIcon && (
                    <MantineIcon color="ldGray.8" icon={selectedChartIcon} />
                )
            }
            styles={{
                input: {
                    color: 'transparent',
                    width: '4px',
                },
            }}
        />
    );
};
