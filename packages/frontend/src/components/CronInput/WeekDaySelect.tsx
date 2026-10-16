import { Select } from '@mantine/core';
import React, { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

const WEEK_DAY_KEYS = [
    'cronInput.weekDays.sunday',
    'cronInput.weekDays.monday',
    'cronInput.weekDays.tuesday',
    'cronInput.weekDays.wednesday',
    'cronInput.weekDays.thursday',
    'cronInput.weekDays.friday',
    'cronInput.weekDays.saturday',
];

const WeekDaySelect: FC<{
    disabled?: boolean;
    value: number;
    onChange: (value: number) => void;
}> = ({ disabled, value, onChange }) => {
    const { t } = useTranslation('scheduler');
    const options = useMemo(
        () =>
            WEEK_DAY_KEYS.map((key, index) => ({
                value: String(index),
                label: t(key),
            })),
        [t],
    );
    return (
        <Select
            data={options}
            value={String(value)}
            disabled={disabled}
            w={140}
            onChange={(val) => {
                onChange(Number(val));
            }}
        />
    );
};
export default WeekDaySelect;
