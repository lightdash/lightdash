import {
    type ApiGetMetricPeek,
    type TimeDimensionConfig,
} from '@lightdash/common';
import { Box, Select, Text } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
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
        selected: boolean;
    }
>(({ value, label, ...others }, ref) => (
    <Box ref={ref} {...others}>
        <Text fz="sm" c="ldDark.8" fw={500}>
            {label}
        </Text>
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
                group: f.tableLabel,
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
                <MantineIcon
                    color="ldDark.2"
                    icon={IconChevronDown}
                    size={12}
                />
            }
        />
    );
};
