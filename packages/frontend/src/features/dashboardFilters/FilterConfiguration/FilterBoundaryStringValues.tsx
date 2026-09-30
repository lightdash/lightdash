import {
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Loader, Stack, Text } from '@mantine/core';
import { useMemo, useState, type FC } from 'react';
import FilterMultiStringInput from '../../../components/common/Filters/FilterInputs/FilterMultiStringInput';
import useFiltersContext from '../../../components/common/Filters/useFiltersContext';
import { useFieldValues } from '../../../hooks/useFieldValues';

const FilterBoundaryStringValues: FC<{
    field: DashboardFilterableField;
    filterRule: DashboardFilterRule;
    values: string[];
    onChange: (values: string[]) => void;
}> = ({ field, filterRule, values, onChange }) => {
    const [search, setSearch] = useState('');
    const {
        projectUuid,
        getAutocompleteFilterGroup,
        getField,
        parameterValues,
    } = useFiltersContext();
    const filters = useMemo(
        () => getAutocompleteFilterGroup(filterRule.id, field),
        [getAutocompleteFilterGroup, filterRule.id, field],
    );
    const { results, isInitialLoading, isError } = useFieldValues(
        search,
        getField(filterRule)?.suggestions ?? [],
        projectUuid,
        field,
        filterRule.id,
        filters,
        true,
        false,
        { refetchOnMount: 'always' },
        parameterValues,
    );
    const matchingResults = useMemo(() => {
        const query = search.toLowerCase();
        return results.filter(
            ({ value, label }) =>
                value.toLowerCase().includes(query) ||
                label?.toLowerCase().includes(query),
        );
    }, [results, search]);
    return (
        <Stack gap="xxs">
            <FilterMultiStringInput
                preserveWhitespace
                values={values}
                suggestions={matchingResults.map(({ value }) => value)}
                filterOptions={false}
                suggestionLabels={
                    new Map(
                        results.map(({ value, label }) => [
                            value,
                            label ?? value,
                        ]),
                    )
                }
                onSearchChange={setSearch}
                rightSection={
                    isInitialLoading ? <Loader size={14} /> : undefined
                }
                placeholder="Add permitted values"
                onChange={onChange}
                comboboxProps={{ withinPortal: false }}
            />
            {isError && (
                <Text size="xs" c="dimmed">
                    Could not load suggestions. You can still enter permitted
                    values.
                </Text>
            )}
        </Stack>
    );
};

export default FilterBoundaryStringValues;
