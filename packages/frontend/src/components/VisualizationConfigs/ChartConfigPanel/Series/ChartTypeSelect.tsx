import { CartesianSeriesType } from '@lightdash/common';
import { type SelectProps, Select } from '@mantine/core';
import { IconChartDots } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import {
    AreaChartIcon,
    BarChartIcon,
    LineChartIcon,
    MixedChartIcon,
} from '../../../common/ContentIcons';
import MantineIcon from '../../../common/MantineIcon';
import seriesClasses from './Series.module.css';

const CHART_TYPE_OPTIONS = [
    { value: CartesianSeriesType.BAR, label: 'Bar', icon: BarChartIcon },
    { value: CartesianSeriesType.LINE, label: 'Line', icon: LineChartIcon },
    { value: CartesianSeriesType.AREA, label: 'Area', icon: AreaChartIcon },
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
                ? [{ value: 'mixed', label: 'Mixed', icon: MixedChartIcon }]
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
            classNames={{ input: seriesClasses.chartTypeInput }}
        />
    );
};
