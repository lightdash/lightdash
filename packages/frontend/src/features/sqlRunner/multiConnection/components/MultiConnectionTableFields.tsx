import { useDebouncedValue } from '@mantine/hooks';
import Fuse from 'fuse.js';
import { useMemo, useState, type FC } from 'react';
import { TableFieldsList } from '../../components/TableFieldsList';
import { type WarehouseTableField } from '../../hooks/useTableFields';
import { useAppSelector } from '../../store/hooks';
import { useActiveConnection } from '../hooks/useActiveConnection';
import { useConnectionTableFields } from '../hooks/useConnectionCatalog';
import { qualifiedTableName } from '../utils/warehouseTreeRows';

const MIN_SEARCH_LENGTH = 2;

export const MultiConnectionTableFields: FC = () => {
    const { projectUuid, activeTable } = useActiveConnection();
    const quoteChar = useAppSelector((state) => state.sqlRunner.quoteChar);

    const [search, setSearch] = useState<string>('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const effectiveSearch =
        debouncedSearch.trim().length >= MIN_SEARCH_LENGTH
            ? debouncedSearch
            : '';

    const { data, isInitialLoading, isSuccess } = useConnectionTableFields({
        projectUuid,
        identity: activeTable,
    });

    const fields = useMemo<WarehouseTableField[]>(
        () =>
            Object.entries(data ?? {})
                .map(([name, type]) => ({ name, type }))
                .filter((field) => field.name.trim() !== ''),
        [data],
    );

    const visibleFields = useMemo(() => {
        if (!effectiveSearch) return fields;
        const fuse = new Fuse(fields, {
            threshold: 0.3,
            isCaseSensitive: false,
            ignoreLocation: true,
            keys: ['name'],
        });
        return fuse.search(effectiveSearch).map((result) => result.item);
    }, [fields, effectiveSearch]);

    if (!activeTable) return null;

    const pathParts = [activeTable.database, activeTable.schema].filter(
        (part) => part !== '',
    );

    return (
        <TableFieldsList
            pathPrefix={pathParts.length > 0 ? pathParts.join('.') : null}
            table={activeTable.table}
            copyValue={qualifiedTableName(activeTable, quoteChar)}
            fields={visibleFields}
            isLoading={isInitialLoading}
            isReady={isSuccess}
            search={search}
            onSearchChange={setSearch}
            highlight={effectiveSearch}
        />
    );
};
