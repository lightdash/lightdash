import { CartesianSeriesType } from '@lightdash/common';
import { Select, type SelectProps } from '@mantine/core';
import {
    IconChartArea,
    IconChartAreaLine,
    IconChartBar,
    IconChartDots,
    IconChartLine,
    type Icon,
} from '@tabler/icons-react';
import { forwardRef, useMemo, type FC } from 'react';
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

interface ItemProps extends React.ComponentPropsWithoutRef<'div'> {
    icon: Icon;
    label: string;
    description: string;
}

const SelectItem = forwardRef<HTMLDivElement, ItemProps>(
    ({ icon, ...others }: ItemProps, ref) => (
        <div ref={ref} {...others}>
            <MantineIcon icon={icon} />
        </div>
    ),
);

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
            label={showLabel && 'Type'}
            value={chartValue}
            data={options}
            onChange={onChange}
            itemComponent={SelectItem}
            icon={
                selectedChartIcon && (
                    <MantineIcon color="gray.8" icon={selectedChartIcon} />
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
