import { Select } from '@mantine/core';
import { type FC } from 'react';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { getGrainOptions } from './dateZoomGrains';

/** A date zoom's grain, over the dashboard's enabled grains. */
export const GrainSelect: FC<{
    label: string;
    granularities: string[];
    customLabels: Record<string, string>;
    value: string | null;
    /** Shown while cleared: what the tiles fall back to. */
    placeholder: string;
    isClearable: boolean;
    onChange: (granularity: string | null) => void;
}> = ({
    label,
    granularities,
    customLabels,
    value,
    placeholder,
    isClearable,
    onChange,
}) => {
    const getUiString = useUiStrings();
    return (
        <Select
            size="xs"
            aria-label={label}
            data={getGrainOptions(granularities, customLabels, getUiString)}
            value={value}
            placeholder={placeholder}
            allowDeselect={false}
            clearable={isClearable}
            // Mantine hides its clear button from the keyboard; here it is the
            // only way to clear, so it is a named tab stop, as `LazySelect`'s
            clearButtonProps={{
                'aria-label': getUiString('controls.dateZoom.clearGrain'),
                'aria-hidden': false,
                tabIndex: 0,
            }}
            comboboxProps={{ withinPortal: true }}
            onChange={onChange}
        />
    );
};
