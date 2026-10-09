import { useDebouncedValue } from '@mantine/hooks';
import { useState, type FC } from 'react';
import { useTableFields } from '../hooks/useTableFields';
import { useAppSelector } from '../store/hooks';
import { TableFieldsList } from './TableFieldsList';

const MIN_SEARCH_LENGTH = 2;

export const TableFields: FC = () => {
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const activeTable = useAppSelector((state) => state.sqlRunner.activeTable);
    const activeSchema = useAppSelector(
        (state) => state.sqlRunner.activeSchema,
    );
    const activeDatabase = useAppSelector(
        (state) => state.sqlRunner.activeDatabase,
    );
    const quoteChar = useAppSelector((state) => state.sqlRunner.quoteChar);

    const [search, setSearch] = useState<string>('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const isValidSearch = debouncedSearch.trim().length >= MIN_SEARCH_LENGTH;

    const {
        data: tableFields,
        isLoading,
        isSuccess,
    } = useTableFields({
        projectUuid,
        tableName: activeTable,
        schema: activeSchema,
        search: isValidSearch ? debouncedSearch : undefined,
    });

    if (!activeTable) return null;

    const pathParts = [activeDatabase, activeSchema].filter(
        (part): part is string => !!part,
    );
    const quote = (part: string) => `${quoteChar}${part}${quoteChar}`;

    return (
        <TableFieldsList
            pathPrefix={pathParts.length > 0 ? pathParts.join('.') : null}
            table={activeTable}
            copyValue={[...pathParts, activeTable].map(quote).join('.')}
            fields={tableFields ?? []}
            isLoading={isLoading}
            isReady={isSuccess}
            search={search}
            onSearchChange={setSearch}
            highlight={isValidSearch ? debouncedSearch : ''}
        />
    );
};
