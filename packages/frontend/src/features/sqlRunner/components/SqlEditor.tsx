import { Center, Loader } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import isEmpty from 'lodash/isEmpty';
import { useCallback, useMemo, type FC } from 'react';
import { SqlEditor as CodeMirrorSqlEditor } from '../../../components/CodeMirror';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useParameters } from '../../../hooks/parameters/useParameters';
import { useDetectedTableFields } from '../hooks/useDetectedTableFields';
import {
    generateTableCompletions,
    useSqlAutocompletions,
} from '../hooks/useSqlAutocompletions';
import { useTableFields } from '../hooks/useTableFields';
import { useTables, type TablesBySchema } from '../hooks/useTables';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setSql } from '../store/sqlRunnerSlice';

// CodeMirror uses 0-based positions
export type HighlightChar = {
    line: number;
    char: number;
};

// highlight line
type HighlightLine = {
    start: HighlightChar;
    end?: HighlightChar;
};

const DEBOUNCE_TIME = 500;

export const SqlEditor: FC<{
    onSubmit?: (sql: string) => void;
    highlightText?: HighlightLine;
    resetHighlightError?: () => void;
}> = ({ onSubmit, highlightText, resetHighlightError }) => {
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const dispatch = useAppDispatch();
    const quoteChar = useAppSelector((state) => state.sqlRunner.quoteChar);
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const warehouseConnectionType = useAppSelector(
        (state) => state.sqlRunner.warehouseConnectionType,
    );

    // Fetch all available parameters for the project
    const { data: availableParameters } = useParameters(projectUuid, undefined);

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
        if (!tablesData || isEmpty(tablesData)) return undefined;
        const [database] = Object.keys(tablesData);
        if (!database) return undefined;

        const tablesBySchema = Object.entries(tablesData).flatMap(
            ([, schemas]) =>
                Object.entries(schemas).map(([schema, tables]) => ({
                    schema,
                    tables,
                })),
        );
        return {
            database,
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

    const tablesList = useMemo(
        () =>
            transformedData && quoteChar
                ? generateTableCompletions(quoteChar, transformedData)
                : [],
        [transformedData, quoteChar],
    );

    const autocompletions = useSqlAutocompletions({
        quoteChar,
        tables: tablesList,
        fields: allFieldsData.length > 0 ? allFieldsData : [],
        availableParameters,
    });

    const handleChange = useCallback(
        (val: string) => {
            if (highlightText && resetHighlightError) {
                resetHighlightError();
            }
            dispatch(setSql(val));
        },
        [dispatch, highlightText, resetHighlightError],
    );

    const handleSubmit = useCallback(() => {
        if (onSubmit) {
            onSubmit(sql);
        }
    }, [onSubmit, sql]);

    // Convert highlight errors to the format expected by CodeMirror
    const highlightErrors = useMemo(() => {
        if (!highlightText) return undefined;

        // If no end, highlight only the start + 1 character
        const end = highlightText.end || {
            line: highlightText.start.line,
            char: highlightText.start.char + 1,
        };

        // CodeMirror uses 0-based line numbers and character positions
        // Calculate the absolute position in the document
        const lines = sql.split('\n');
        let from = 0;
        for (let i = 0; i < highlightText.start.line - 1; i++) {
            from += lines[i].length + 1; // +1 for newline
        }
        from += highlightText.start.char - 1;

        let to = 0;
        for (let i = 0; i < end.line - 1; i++) {
            to += lines[i].length + 1;
        }
        to += end.char - 1;

        return [{ from, to, message: 'Error' }];
    }, [highlightText, sql]);

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
        <CodeMirrorSqlEditor
            value={sql}
            onChange={handleChange}
            onSubmit={handleSubmit}
            debounceMs={DEBOUNCE_TIME}
            autocompletions={autocompletions}
            highlightErrors={highlightErrors}
            height="100%"
        />
    );
};
