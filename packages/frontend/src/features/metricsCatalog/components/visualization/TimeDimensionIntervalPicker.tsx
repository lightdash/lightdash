import { TimeFrames, type TimeDimensionConfig } from '@lightdash/common';
import { Select } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useSelectStyles } from '../../styles/useSelectStyles';

type Props = {
    dimension: TimeDimensionConfig;
    onChange: (timeDimensionOverride: TimeDimensionConfig) => void;
};

export const TimeDimensionIntervalPicker: FC<Props> = ({
    dimension,
    onChange,
}) => {
    const { classes } = useSelectStyles();
    return (
        <Select
            w={100}
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
            classNames={{
                input: classes.input,
                item: classes.item,
                rightSection: classes.rightSection,
            }}
        />
    );
};
