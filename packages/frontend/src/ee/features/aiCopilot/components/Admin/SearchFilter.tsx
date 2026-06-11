import { type TextInputProps } from '@mantine-8/core';
import { ContentTableSearchInput } from '../../../../../components/common/ContentTable';
import { type useAiAgentAdminFilters } from '../../hooks/useAiAgentAdminFilters';

type SearchFilterProps = Pick<
    ReturnType<typeof useAiAgentAdminFilters>,
    'search' | 'setSearch'
> &
    Pick<TextInputProps, 'placeholder'>;

export const SearchFilter = ({
    search,
    setSearch,
    placeholder,
}: SearchFilterProps) => {
    return (
        <ContentTableSearchInput
            tooltipLabel="Search current view"
            placeholder={placeholder}
            value={search ?? ''}
            onChange={setSearch}
            collapsedWidth={340}
            expandedWidth={340}
        />
    );
};
