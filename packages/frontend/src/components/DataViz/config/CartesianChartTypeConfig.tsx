import { ChartKind, type CartesianChartDisplay } from '@lightdash/common';
import { Box, Group, Select, Text } from '@mantine/core';
import { forwardRef, type ComponentPropsWithoutRef, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import { getChartIcon } from '../../common/ResourceIcon';

type Props = {
    type: ChartKind | undefined;
    onChangeType: (
        value: NonNullable<CartesianChartDisplay['series']>[number]['type'],
    ) => void;
    canSelectDifferentTypeFromBaseChart: boolean;
};

const ChartTypeIcon: FC<{ type: ChartKind }> = ({ type }) => (
    <MantineIcon icon={getChartIcon(type)} color="indigo.4" />
);

const ChartTypeItem = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<'div'> & { value: ChartKind; label: string }
>(({ value, label, ...others }, ref) => (
    <Box ref={ref} {...others}>
        <Group noWrap spacing="xs">
            <ChartTypeIcon type={value} />
            <Text>{label}</Text>
        </Group>
    </Box>
));

export const CartesianChartTypeConfig: FC<Props> = ({ onChangeType, type }) => {
    const options = [
        {
            value: ChartKind.VERTICAL_BAR,
            label: 'Vertical Bar',
        },
        {
            value: ChartKind.LINE,
            label: 'Line',
        },
    ];

    return (
        <Select
            radius="md"
            data={options.map((option) => ({
                value: option.value,
                label: option.label,
            }))}
            itemComponent={ChartTypeItem}
            icon={type && <ChartTypeIcon type={type} />}
            value={type}
            onChange={(
                value: Extract<
                    ChartKind,
                    ChartKind.LINE | ChartKind.VERTICAL_BAR
                >,
            ) => value && onChangeType(value)}
            styles={(theme) => ({
                input: {
                    width: '150px',
                    fontWeight: 500,
                },
                item: {
                    '&[data-selected="true"]': {
                        color: theme.colors.gray[7],
                        fontWeight: 500,
                        backgroundColor: theme.colors.gray[2],
                    },
                    '&[data-selected="true"]:hover': {
                        backgroundColor: theme.colors.gray[3],
                    },
                    '&:hover': {
                        backgroundColor: theme.colors.gray[1],
                    },
                },
            })}
        />
    );
};
