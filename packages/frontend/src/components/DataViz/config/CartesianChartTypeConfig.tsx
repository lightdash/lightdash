import {
    CartesianSeriesType,
    ChartKind,
    type CartesianChartDisplay,
} from '@lightdash/common';
import { Box, Group, Text, Select } from '@mantine-8/core';
import { forwardRef, type ComponentPropsWithoutRef, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import { getChartIcon } from '../../common/ResourceIcon/utils';
import classes from './SelectConfig.module.css';

type Props = {
    type: CartesianSeriesType | undefined;
    onChangeType: (
        value: NonNullable<CartesianChartDisplay['series']>[number]['type'],
    ) => void;
    canSelectDifferentTypeFromBaseChart: boolean;
};

const ChartTypeIcon: FC<{ type: CartesianSeriesType }> = ({ type }) => {
    const chartKind =
        type === CartesianSeriesType.BAR
            ? ChartKind.VERTICAL_BAR
            : ChartKind.LINE;

    return <MantineIcon icon={getChartIcon(chartKind)} color="ldDark.8" />;
};

const ChartTypeItem = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<'div'> & {
        value: CartesianSeriesType;
        label: string;
    }
>(({ value, label, ...others }, ref) => (
    <Box ref={ref} {...others}>
        <Group wrap="nowrap" gap="xs">
            <ChartTypeIcon type={value} />
            <Text>{label}</Text>
        </Group>
    </Box>
));

export const CartesianChartTypeConfig: FC<Props> = ({ onChangeType, type }) => {
    const options = [
        {
            value: CartesianSeriesType.BAR,
            label: 'Bar',
        },
        {
            value: CartesianSeriesType.LINE,
            label: 'Line',
        },
    ];

    return (
        <Select
            allowDeselect={false}
            radius="md"
            data={options.map((option) => ({
                value: option.value,
                label: option.label,
            }))}
            renderOption={({ option }) => (
                <ChartTypeItem
                    value={option.value as CartesianSeriesType}
                    label={option.label}
                />
            )}
            leftSection={type && <ChartTypeIcon type={type} />}
            value={type}
            onChange={(value) =>
                value &&
                onChangeType(
                    value as Extract<
                        CartesianSeriesType,
                        CartesianSeriesType.LINE | CartesianSeriesType.BAR
                    >,
                )
            }
            classNames={classes}
        />
    );
};
