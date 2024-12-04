import {
    type ApiGetMetricPeek,
    type TimeDimensionConfig,
} from '@lightdash/common';
import { Box, Group, Select, Text, useMantineTheme } from '@mantine/core';
import { IconCalendar } from '@tabler/icons-react';
import {
    forwardRef,
    type ComponentPropsWithoutRef,
    type Dispatch,
    type FC,
    type SetStateAction,
} from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';

type Props = {
    fields: NonNullable<ApiGetMetricPeek['results']['availableTimeDimensions']>;
    dimension: TimeDimensionConfig;
    onChange: Dispatch<SetStateAction<TimeDimensionConfig | undefined>>;
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
        <Group noWrap spacing="xs">
            <Text size="xs" fw={500}>
                {label}
            </Text>
            <Text size="xs" color="dimmed" span>
                {tableLabel}
            </Text>
        </Group>
    </Box>
));

export const TimeDimensionPicker: FC<Props> = ({
    fields,
    dimension,
    onChange,
}) => {
    const theme = useMantineTheme();

    return (
        <Select
            radius="md"
            icon={<MantineIcon color="dark.3" icon={IconCalendar} />}
            data={fields.map((f) => ({
                value: f.name,
                label: f.label,
                tableLabel: f.tableLabel,
            }))}
            value={dimension?.field}
            onChange={(value) => {
                if (!value) return;
                onChange((prev) => ({
                    field: value,
                    interval: prev?.interval ?? dimension.interval,
                    table:
                        fields.find((f) => f.name === value)?.table ??
                        dimension.table,
                }));
            }}
            w="100%"
            itemComponent={FieldItem}
            styles={{
                input: {
                    fontWeight: 500,
                    borderColor: theme.colors.gray[2],
                    borderRadius: theme.radius.md,
                    boxShadow: theme.shadows.subtle,
                    '&:hover': {
                        backgroundColor: theme.colors.gray[0],
                    },
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
            }}
            rightSectionWidth="min-content"
        />
    );
};
