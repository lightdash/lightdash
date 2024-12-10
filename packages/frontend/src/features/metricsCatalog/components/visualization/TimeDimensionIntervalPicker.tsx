import { TimeFrames, type TimeDimensionConfig } from '@lightdash/common';
import { Select } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';

type Props = {
    dimension: TimeDimensionConfig;
    onChange: (timeDimensionOverride: TimeDimensionConfig) => void;
};

export const TimeDimensionIntervalPicker: FC<Props> = ({
    dimension,
    onChange,
}) => {
    return (
        <Select
            w={90}
            size="xs"
            radius="md"
            color="gray"
            data={[
                {
                    value: TimeFrames.DAY,
                    label: 'Daily',
                },
                {
                    value: TimeFrames.WEEK,
                    label: 'Weekly',
                },
                {
                    value: TimeFrames.MONTH,
                    label: 'Monthly',
                },
                {
                    value: TimeFrames.YEAR,
                    label: 'Yearly',
                },
            ]}
            value={dimension?.interval}
            onChange={(value: TimeFrames) => {
                if (!value) return;
                onChange({
                    interval: value,
                    field: dimension.field,
                    table: dimension.table,
                });
            }}
            withinPortal
            rightSection={
                <MantineIcon color="dark.2" icon={IconChevronDown} size={12} />
            }
            styles={(theme) => ({
                input: {
                    fontWeight: 500,
                    paddingRight: 4,

                    borderColor: theme.colors.gray[2],
                    borderRadius: theme.radius.md,
                    boxShadow: theme.shadows.subtle,
                    '&:hover': {
                        backgroundColor: theme.colors.gray[0],
                    },
                },
                rightSection: { pointerEvents: 'none' },
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
