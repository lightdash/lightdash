import { type TextInputProps } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { useCallback, useState } from 'react';
import { ContentTableSearchInput } from '../../../../../components/common/ContentTable';
import { type useAiAgentAdminFilters } from '../../hooks/useAiAgentAdminFilters';

type SearchFilterProps = Pick<
    ReturnType<typeof useAiAgentAdminFilters>,
    'search' | 'setSearch'
> &
    Pick<TextInputProps, 'placeholder'> & {
        debounceMs?: number;
    };

export const SearchFilter = ({
    search,
    setSearch,
    placeholder,
    debounceMs,
}: SearchFilterProps) => {
    const [inputValue, setInputValue] = useState(search ?? '');
    const debouncedSetSearch = useDebouncedCallback(setSearch, debounceMs ?? 0);

    const handleChange = useCallback(
        (value: string) => {
            if (!debounceMs) {
                setSearch(value);
                return;
            }

            setInputValue(value);
            debouncedSetSearch(value || undefined);
            if (value === '') debouncedSetSearch.flush();
        },
        [debounceMs, debouncedSetSearch, setSearch],
    );

    return (
        <ContentTableSearchInput
            tooltipLabel="Search current view"
            placeholder={placeholder}
            value={debounceMs ? inputValue : (search ?? '')}
            onChange={handleChange}
            collapsedWidth={340}
            expandedWidth={340}
        />
    );
};
