import { isSummaryExploreError, type SummaryExplore } from '@lightdash/common';
import { IconTable } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import FilterFacet, {
    type FilterFacetOption,
} from '../../../../components/common/FilterFacet';
import { useExplores } from '../../../../hooks/useExplores';
import { useAppSelector } from '../../../sqlRunner/store/hooks';

type TableFilterProps = {
    selectedTables: string[];
    setSelectedTables: (tables: string[]) => void;
};

const TableFilter: FC<TableFilterProps> = ({
    selectedTables,
    setSelectedTables,
}) => {
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const [searchValue, setSearchValue] = useState('');

    const { data: explores, isLoading } = useExplores(projectUuid, true);

    const tables = useMemo(() => {
        if (!explores) return [];
        return explores
            .filter(
                (explore): explore is SummaryExplore =>
                    !isSummaryExploreError(explore),
            )
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [explores]);

    const options = useMemo<FilterFacetOption[]>(() => {
        const search = searchValue.trim().toLowerCase();
        return tables
            .filter(
                (table) =>
                    !search ||
                    table.name.toLowerCase().includes(search) ||
                    table.label.toLowerCase().includes(search),
            )
            .map((table) => ({ value: table.name, label: table.label }));
    }, [tables, searchValue]);

    return (
        <FilterFacet
            label="Tables"
            icon={IconTable}
            options={options}
            selected={selectedTables}
            onChange={setSelectedTables}
            tooltipLabel="Filter metrics by table"
            loading={isLoading}
            clearable
            emptyLabel={
                searchValue
                    ? 'No tables match your search.'
                    : 'No tables available.'
            }
            searchValue={searchValue}
            onSearchChange={tables.length > 5 ? setSearchValue : undefined}
            searchPlaceholder="Search tables..."
        />
    );
};

export default TableFilter;
