import { Select } from '@mantine/core';
import React, { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Frequency } from './cronInputUtils';
import styles from './FrequencySelect.module.css';

const FREQUENCY_LABEL_KEYS: Record<Frequency, string> = {
    [Frequency.HOURLY]: 'cronInput.frequency.hourly',
    [Frequency.DAILY]: 'cronInput.frequency.daily',
    [Frequency.WEEKDAYS]: 'cronInput.frequency.weekdays',
    [Frequency.WEEKLY]: 'cronInput.frequency.weekly',
    [Frequency.MONTHLY]: 'cronInput.frequency.monthly',
    [Frequency.CUSTOM]: 'cronInput.frequency.custom',
};

const FREQUENCIES: Frequency[] = [
    Frequency.HOURLY,
    Frequency.DAILY,
    Frequency.WEEKDAYS,
    Frequency.WEEKLY,
    Frequency.MONTHLY,
    Frequency.CUSTOM,
];

const FrequencySelect: FC<{
    disabled?: boolean;
    value: Frequency;
    onChange: (value: Frequency | null | string) => void;
}> = ({ disabled, value, onChange }) => {
    const { t } = useTranslation('scheduler');
    const frequencyItems = useMemo(
        () =>
            FREQUENCIES.map((frequency) => ({
                value: frequency,
                label: t(FREQUENCY_LABEL_KEYS[frequency]),
            })),
        [t],
    );
    return (
        <Select
            className={styles.select}
            data={frequencyItems}
            value={value}
            disabled={disabled}
            onChange={onChange}
            w={120}
        />
    );
};
export default FrequencySelect;
