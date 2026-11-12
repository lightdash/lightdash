import { Select } from '@mantine/core';
import { type FC } from 'react';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { getGrainOptions } from './dateZoomGrains';

/** A date zoom's grain, over the dashboard's enabled grains. */
export const GrainSelect: FC<{
    label: string;
    granularities: string[];
    customLabels: Record<string, string>;
    value: string;
    onChange: (granularity: string) => void;
}> = ({ label, granularities, customLabels, value, onChange }) => {
    const getUiString = useUiStrings();
    return (
        <Select
            size="xs"
            aria-label={label}
            data={getGrainOptions(granularities, customLabels, getUiString)}
            value={value}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            onChange={(granularity) => {
                if (granularity !== null) onChange(granularity);
            }}
        />
    );
};
