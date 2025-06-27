import { Center, Loader } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import {
    MonacoSqlEditor,
    type MonacoHighlightLine,
} from '../../../components/common/MonacoSqlEditor';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useDetectedTableFields } from '../hooks/useDetectedTableFields';
import { useSqlEditorPreferences } from '../hooks/useSqlEditorPreferences';
import { useTableFields } from '../hooks/useTableFields';
import { useTables, type TablesBySchema } from '../hooks/useTables';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setSql } from '../store/sqlRunnerSlice';

export const SqlEditor: FC<{
    onSubmit?: (sql: string) => void;
    highlightText?: MonacoHighlightLine;
    resetHighlightError?: () => void;
}> = ({ onSubmit, highlightText, resetHighlightError }) => {
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const dispatch = useAppDispatch();
    const quoteChar = useAppSelector((state) => state.sqlRunner.quoteChar);
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const warehouseConnectionType = useAppSelector(
        (state) => state.sqlRunner.warehouseConnectionType,
    );

    const [settings] = useSqlEditorPreferences(warehouseConnectionType);

    const { data: tablesData, isLoading: isTablesDataLoading } = useTables({
        projectUuid,
    });

    const currentTable = useAppSelector((state) => state.sqlRunner.activeTable);
    const currentSchema = useAppSelector(
        (state) => state.sqlRunner.activeSchema,
    );

    const { data: tableFieldsData } = useTableFields({
        projectUuid,
        tableName: currentTable,
        schema: currentSchema,
        search: undefined,
    });

    const transformedData:
        | { database: string; tablesBySchema: TablesBySchema }
        | undefined = useMemo(() => {
        if (!tablesData) return undefined;
        const tablesBySchema = Object.entries(tablesData).flatMap(
            ([, schemas]) =>
                Object.entries(schemas).map(([schema, tables]) => ({
                    schema,
                    tables,
                })),
        );
        return {
            database: Object.keys(tablesData)[0],
            tablesBySchema,
        };
    }, [tablesData]);

    // Use React Query to fetch field data for all detected tables in SQL
    const { data: detectedTablesFieldData } = useDetectedTableFields({
        sql,
        quoteChar,
        projectUuid,
        transformedData,
    });

    // Transform current table fields to include context and combine with detected table fields
    const allFieldsData = useMemo(() => {
        const currentTableFieldsWithContext = (tableFieldsData || []).map(
            (field) => ({
                ...field,
                table: currentTable || '',
                schema: currentSchema || '',
            }),
        );
        return [
            ...currentTableFieldsWithContext,
            ...(detectedTablesFieldData || []),
        ];
    }, [tableFieldsData, detectedTablesFieldData, currentTable, currentSchema]);

    const handleChange = useCallback(
        (value: string) => {
            dispatch(setSql(value));
        },
        [dispatch],
    );

    if (isTablesDataLoading) {
        return (
            <Center h="100%">
                <Loader color="gray" size="xs" />
            </Center>
        );
    }

    if (!warehouseConnectionType) {
        return (
            <SuboptimalState
                title="Warehouse connection not available"
                icon={IconAlertCircle}
            />
        );
    }

    return (
        <MonacoSqlEditor
            value={sql}
            onChange={handleChange}
            onSubmit={onSubmit}
            highlightText={highlightText}
            resetHighlightError={resetHighlightError}
            warehouseConnectionType={warehouseConnectionType}
            quoteChar={quoteChar}
            tables={transformedData}
            fields={allFieldsData}
            settings={settings}
            isLoading={isTablesDataLoading}
        />
    );
};
