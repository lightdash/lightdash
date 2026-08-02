import { TimeFrames, type TimeDimensionConfig } from '@lightdash/common';
import { Select } from '@mantine-8/core';
import { IconChevronDown } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import selectStyles from '../../styles/selectStyles.module.css';

type Props = {
    dimension: TimeDimensionConfig;
    onChange: (timeDimensionOverride: TimeDimensionConfig) => void;
};

export const TimeDimensionIntervalPicker: FC<Props> = ({
    dimension,
    onChange,
}) => {
    const [optimisticInterval, setOptimisticInterval] = useState(
        dimension.interval,
    );
    return (
        <Select
            allowDeselect={false}
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
            value={optimisticInterval}
            onChange={(value) => {
                if (!value) return;
                const interval = value as TimeFrames;
                setOptimisticInterval(interval);

                onChange({
                    interval,
                    field: dimension.field,
                    table: dimension.table,
                });
            }}
            comboboxProps={{ withinPortal: true }}
            rightSection={
                <MantineIcon
                    color="ldGray.7"
                    icon={IconChevronDown}
                    size={12}
                />
            }
            classNames={{
                wrapper: selectStyles.wrapper,
                input: selectStyles.input,
                option: selectStyles.option,
                section: selectStyles.rightSection,
            }}
        />
    );
};
