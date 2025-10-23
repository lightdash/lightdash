import { Center, Loader } from '@mantine/core';
import Editor, {
    useMonaco,
    type BeforeMount,
    type OnChange,
    type OnMount,
} from '@monaco-editor/react';
import { IconAlertCircle } from '@tabler/icons-react';
import debounce from 'lodash/debounce';
import isEmpty from 'lodash/isEmpty';
import { type editor } from 'monaco-editor';
import { useCallback, useEffect, useMemo, useRef, type FC } from 'react';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useParameters } from '../../../hooks/parameters/useParameters';
import '../../../styles/monaco.css';
import { useDetectedTableFields } from '../hooks/useDetectedTableFields';
import { useSqlEditorPreferences } from '../hooks/useSqlEditorPreferences';
import { useTableFields } from '../hooks/useTableFields';
import { useTables, type TablesBySchema } from '../hooks/useTables';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setSql } from '../store/sqlRunnerSlice';
import {
    generateTableCompletions,
    getMonacoLanguage,
    LIGHTDASH_THEME,
    MONACO_DEFAULT_OPTIONS,
    registerCustomCompletionProvider,
    registerMonacoLanguage,
} from '../utils/monaco';

// monaco highlight character
export type MonacoHighlightChar = {
    line: number;
    char: number;
};

// monaco highlight line
type MonacoHighlightLine = {
    start: MonacoHighlightChar;
    end?: MonacoHighlightChar;
};

const DEBOUNCE_TIME = 500;

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

    const editorRef = useRef<Parameters<OnMount>['0'] | null>(null);

    const language = useMemo(
        () => getMonacoLanguage(warehouseConnectionType),
        [warehouseConnectionType],
    );

    const beforeMount: BeforeMount = useCallback(
        (monaco) => {
            registerMonacoLanguage(monaco, language);
            monaco.editor.defineTheme('lightdash', {
                base: 'vs',
                inherit: true,
                ...LIGHTDASH_THEME,
            });
        },
        [language],
    );

    const monaco = useMonaco();
    const decorationsCollectionRef =
        useRef<editor.IEditorDecorationsCollection | null>(null); // Ref to store the decorations collection
    const completionProviderRef = useRef<{ dispose: () => void } | null>(null); // Ref to store the completion provider

    const onMount: OnMount = useCallback(
        (editorObj, monacoObj) => {
            editorRef.current = editorObj;
            decorationsCollectionRef.current =
                editorObj.createDecorationsCollection();
            editorObj.addCommand(
                monacoObj.KeyMod.CtrlCmd | monacoObj.KeyCode.Enter,
                () => {
                    const currentSql = editorObj.getValue();
                    if (!onSubmit) return;
                    onSubmit(currentSql ?? '');
                },
            );

            // When creating a new sql query, focus the editor so the user can start typing immediately
            editorObj.focus();
        },
        [onSubmit],
    );

    // Register completion provider reactively when data changes
    useEffect(() => {
        // Setup logic only runs when all dependencies are available
        if (monaco && quoteChar) {
            // Dispose of the previous completion provider
            if (completionProviderRef.current) {
                completionProviderRef.current.dispose();
                completionProviderRef.current = null;
            }
            const tablesList = transformedData
                ? generateTableCompletions(quoteChar, transformedData, settings)
                : [];
            // Transform current table fields to include context and combine with detected table fields
            const currentTableFieldsWithContext = (tableFieldsData || []).map(
                (field) => ({
                    ...field,
                    table: currentTable || '',
                    schema: currentSchema || '',
                }),
            );
            const allFieldsData = [
                ...currentTableFieldsWithContext,
                ...(detectedTablesFieldData || []),
            ];

            // Always register completion provider, even without tables
            const provider = registerCustomCompletionProvider(
                monaco,
                language,
                quoteChar,
                tablesList || [],
                allFieldsData.length > 0 ? allFieldsData : undefined,
                settings,
                availableParameters,
            );
            completionProviderRef.current = provider;
        }
        // Cleanup function always runs on unmount regardless of conditions
        return () => {
            if (completionProviderRef.current) {
                completionProviderRef.current.dispose();
                completionProviderRef.current = null;
            }
        };
    }, [
        monaco,
        language,
        quoteChar,
        transformedData,
        tableFieldsData,
        detectedTablesFieldData,
        currentTable,
        currentSchema,
        warehouseConnectionType,
        settings,
        availableParameters,
    ]);

    useEffect(() => {
        // remove any existing decorations
        if (decorationsCollectionRef.current) {
            decorationsCollectionRef.current.set([]);
        }
        if (!editorRef.current || !monaco || !decorationsCollectionRef.current)
            return;
        // do nothing if no highlightText is provided
        if (!highlightText) return;
        // if no end, highlight only the start + 1 character
        const highlight = {
            start: highlightText.start,
            end: highlightText.end ?? {
                line: highlightText.start.line,
                char: highlightText.start.char + 1,
            },
        };
        const range = new monaco.Range(
            highlight.start.line,
            highlight.start.char,
            highlight.end.line,
            highlight.end.char,
        );
        const newDecorations = [
            {
                range,
                options: {
                    inlineClassName: 'editorError',
                },
            },
        ];

        // Update decorations using the decorations collection
        decorationsCollectionRef.current.set(newDecorations);
    }, [sql, monaco, highlightText]);

    const debouncedSetSql = useMemo(
        () =>
            debounce(
                (valStr: string) => dispatch(setSql(valStr)),
                DEBOUNCE_TIME,
            ),
        [dispatch],
    );

    const onChange: OnChange = useCallback(
        (val: string | undefined) => {
            if (highlightText && resetHighlightError) {
                resetHighlightError();
            }
            debouncedSetSql(val ?? '');
        },
        [debouncedSetSql, highlightText, resetHighlightError],
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
        <Editor
            loading={<Loader color="gray" size="xs" />}
            beforeMount={beforeMount}
            onMount={onMount}
            language={language}
            value={sql}
            onChange={onChange}
            options={MONACO_DEFAULT_OPTIONS}
            theme="lightdash"
        />
    );
};
