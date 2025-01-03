import {
    type ApiGetMetricPeek,
    type TimeDimensionConfig,
} from '@lightdash/common';
import { Box, Group, Select, Text } from '@mantine/core';
import { IconChevronDown, IconTable } from '@tabler/icons-react';
import { forwardRef, type ComponentPropsWithoutRef, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useSelectStyles } from '../../styles/useSelectStyles';

type Props = {
    fields: NonNullable<ApiGetMetricPeek['results']['availableTimeDimensions']>;
    dimension: TimeDimensionConfig;
    onChange: (config: TimeDimensionConfig) => void;
};

const FieldItem = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<'div'> & {
        value: string;
        label: string;
        tableLabel: string;
        selected: boolean;
    }
>(({ value, label, tableLabel, ...others }, ref) => (
    <Box ref={ref} {...others}>
        <Group noWrap position="apart">
            <Text fz="sm" c="dark.8" fw={500}>
                {label}
            </Text>
            <Group spacing={4} noWrap>
                <MantineIcon color="gray.6" size={12} icon={IconTable} />
                <Text fz="xs" c="gray.6" span>
                    {tableLabel}
                </Text>
            </Group>
        </Group>
    </Box>
));

export const TimeDimensionPicker: FC<Props> = ({
    fields,
    dimension,
    onChange,
}) => {
    const { classes } = useSelectStyles();

    return (
        <Select
            withinPortal
            size="xs"
            radius="md"
            dropdownPosition="top"
            data={fields.map((f) => ({
                value: f.name,
                label: f.label,
                tableLabel: f.tableLabel,
            }))}
            value={dimension?.field}
            onChange={(value) => {
                if (!value) return;
                onChange({
                    field: value,
                    interval: dimension.interval,
                    table:
                        fields.find((f) => f.name === value)?.table ??
                        dimension.table,
                });
            }}
            itemComponent={FieldItem}
            classNames={classes}
            rightSection={
                <MantineIcon color="dark.2" icon={IconChevronDown} size={12} />
            }
        />
    );
};
