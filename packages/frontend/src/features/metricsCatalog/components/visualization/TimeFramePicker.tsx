import { TimeFrames } from '@lightdash/common';
import { Select } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useSelectStyles } from '../../styles/useSelectStyles';

type TimeFrameOption = {
    value: TimeFrames;
    label: string;
};

const DEFAULT_OPTIONS: TimeFrameOption[] = [
    { value: TimeFrames.DAY, label: 'Today' },
    { value: TimeFrames.WEEK, label: 'Current week to date' },
    { value: TimeFrames.MONTH, label: 'Current month to date' },
    { value: TimeFrames.YEAR, label: 'Current year to date' },
];

type Props = {
    value: TimeFrames;
    onChange: (value: TimeFrames) => void;
    options?: TimeFrameOption[];
    width?: number;
};

export const TimeFramePicker: FC<Props> = ({
    value,
    onChange,
    options = DEFAULT_OPTIONS,
    width = 185,
}) => {
    const { classes } = useSelectStyles();

    return (
        <Select
            w={width}
            size="xs"
            radius="md"
            data={options}
            value={value}
            onChange={(val) => {
                if (val) onChange(val as TimeFrames);
            }}
            withinPortal
            rightSection={
                <MantineIcon
                    color="ldGray.7"
                    icon={IconChevronDown}
                    size={12}
                />
            }
            classNames={{
                input: classes.input,
                item: classes.item,
                rightSection: classes.rightSection,
            }}
        />
    );
};
