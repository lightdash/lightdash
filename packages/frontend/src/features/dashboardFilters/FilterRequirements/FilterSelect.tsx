import { Select, Stack, Text } from '@mantine-8/core';
import { type FC } from 'react';
import classes from './FilterRequirements.module.css';

export type SelectableFilter = {
    value: string;
    label: string;
    disabled: boolean;
    reason: string | null;
};

type FilterSelectProps = {
    selectableFilters: SelectableFilter[];
    placeholder: string;
    onSelect: (filterId: string) => void;
};

/**
 * Dashed pill-shaped select used to add a dashboard filter to a filter rule.
 * Ineligible filters are disabled with their reason as a second line.
 */
const FilterSelect: FC<FilterSelectProps> = ({
    selectableFilters,
    placeholder,
    onSelect,
}) => (
    <Select
        size="xs"
        w={150}
        aria-label="Add filter to rule"
        placeholder={placeholder}
        value={null}
        data={selectableFilters}
        comboboxProps={{ withinPortal: false }}
        classNames={{ input: classes.addFilterInput }}
        onChange={(filterId) => {
            if (filterId) onSelect(filterId);
        }}
        renderOption={({ option }) => {
            const reason = selectableFilters.find(
                (filter) => filter.value === option.value,
            )?.reason;
            return (
                <Stack gap={0}>
                    <Text size="xs">{option.label}</Text>
                    {reason && (
                        <Text size="xs" c="ldGray.6">
                            {reason}
                        </Text>
                    )}
                </Stack>
            );
        }}
    />
);

export default FilterSelect;
