import { Select } from '@mantine/core';
import React, { type FC } from 'react';
import { Controller } from 'react-hook-form';

const daysOfWeekOptions = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
].map((x, index) => ({ value: index.toString(), label: x }));

const StartOfWeekSelect: FC<{ disabled: boolean }> = ({ disabled }) => {
    return (
        <Controller
            name="warehouse.startOfWeek"
            render={({ field }) => (
                <Select
                    clearable
                    placeholder="Auto"
                    label="Start of week"
                    description="Will be taken into account when using 'WEEK' time interval"
                    data={daysOfWeekOptions}
                    value={field.value?.toString()}
                    onChange={(value) =>
                        field.onChange(value ? parseInt(value) : null)
                    }
                    disabled={disabled}
                    dropdownPosition="top"
                />
            )}
        />
    );
};

export default StartOfWeekSelect;
