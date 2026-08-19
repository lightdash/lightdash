import {
    MAX_RETENTION_WINDOW_HOURS,
    MIN_RETENTION_WINDOW_HOURS,
    type RetentionWindowHours,
} from '@lightdash/common';
import { Group, Select } from '@mantine/core';
import { useState, type FC } from 'react';
import { NumberInput } from '../../../../components/common/NumberInput';
import {
    formatRetentionHours,
    THREAD_RETENTION_PRESETS,
} from '../utils/threadRetention';

type Props = {
    value: RetentionWindowHours;
    onChange: (value: RetentionWindowHours) => void;
    disabled?: boolean;
    ceilingHours?: RetentionWindowHours;
};

export const ThreadRetentionSelect: FC<Props> = ({
    value,
    onChange,
    disabled,
    ceilingHours = null,
}) => {
    const [customPicked, setCustomPicked] = useState(false);
    const [draftHours, setDraftHours] = useState<number | undefined>(undefined);

    const isPreset =
        value !== null &&
        THREAD_RETENTION_PRESETS.some((p) => p.hours === value) &&
        (ceilingHours === null || value <= ceilingHours);
    const customMode = customPicked || (value !== null && !isPreset);

    const noneLabel =
        ceilingHours !== null
            ? `Inherit org default (${formatRetentionHours(ceilingHours)})`
            : 'Keep forever';

    const presets = THREAD_RETENTION_PRESETS.filter(
        (p) => ceilingHours === null || p.hours <= ceilingHours,
    );

    const selectValue = customMode
        ? 'custom'
        : value === null
          ? 'none'
          : String(value);

    const commitDraft = () => {
        if (draftHours !== undefined && draftHours !== value) {
            onChange(draftHours);
        }
        setDraftHours(undefined);
    };

    return (
        <Group gap="xs" wrap="nowrap">
            <Select
                w={200}
                size="xs"
                disabled={disabled}
                value={selectValue}
                data={[
                    { value: 'none', label: noneLabel },
                    ...presets.map((p) => ({
                        value: String(p.hours),
                        label: p.label,
                    })),
                    { value: 'custom', label: 'Custom…' },
                ]}
                onChange={(selected) => {
                    if (selected === null) return;
                    if (selected === 'custom') {
                        setCustomPicked(true);
                        return;
                    }
                    setCustomPicked(false);
                    setDraftHours(undefined);
                    onChange(selected === 'none' ? null : Number(selected));
                }}
            />
            {customMode && (
                <NumberInput
                    w={120}
                    size="xs"
                    min={MIN_RETENTION_WINDOW_HOURS}
                    max={ceilingHours ?? MAX_RETENTION_WINDOW_HOURS}
                    disabled={disabled}
                    value={draftHours ?? value ?? undefined}
                    placeholder="Hours"
                    suffix=" h"
                    onNumberChange={setDraftHours}
                    onBlur={commitDraft}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            commitDraft();
                        }
                    }}
                />
            )}
        </Group>
    );
};
