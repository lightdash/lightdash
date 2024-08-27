import { WarehouseTypes } from '@lightdash/common';
import { Center, Loader } from '@mantine/core';
import Editor, {
    useMonaco,
    type BeforeMount,
    type EditorProps,
    type Monaco,
    type OnChange,
    type OnMount,
} from '@monaco-editor/react';
import {
    bigqueryLanguageDefinition,
    snowflakeLanguageDefinition,
} from '@popsql/monaco-sql-languages';
import { IconAlertCircle } from '@tabler/icons-react';
import { debounce } from 'lodash';
import { type editor, type languages } from 'monaco-editor';
import { LanguageIdEnum, setupLanguageFeatures } from 'monaco-sql-languages';
import { useCallback, useEffect, useMemo, useRef, type FC } from 'react';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useProject } from '../../../hooks/useProject';
import '../../../styles/monaco.css';
import { useTables } from '../hooks/useTables';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setSql } from '../store/sqlRunnerSlice';

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

const MONACO_DEFAULT_OPTIONS: EditorProps['options'] = {
    cursorBlinking: 'smooth',
    folding: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'off',
    quickSuggestions: true,
    contextmenu: false,
    automaticLayout: true,
};

const getLanguage = (warehouseType?: WarehouseTypes): string => {
    switch (warehouseType) {
        case WarehouseTypes.BIGQUERY:
            return bigqueryLanguageDefinition.id;
        case WarehouseTypes.SNOWFLAKE:
            return snowflakeLanguageDefinition.id;
        case WarehouseTypes.TRINO:
            return LanguageIdEnum.TRINO;
        case WarehouseTypes.DATABRICKS:
            return LanguageIdEnum.SPARK;
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.REDSHIFT:
            return LanguageIdEnum.PG;
        default:
            return snowflakeLanguageDefinition.id;
    }
};

const registerMonacoLanguage = (monaco: Monaco, language: string) => {
    if (
        [
            bigqueryLanguageDefinition.id,
            snowflakeLanguageDefinition.id,
        ].includes(language)
    ) {
        const languageDefinition =
            language === bigqueryLanguageDefinition.id
                ? bigqueryLanguageDefinition
                : snowflakeLanguageDefinition;
        monaco.languages.register(languageDefinition);
        monaco.languages.onLanguage(languageDefinition.id, () => {
            void languageDefinition.loader().then((mod) => {
                monaco.languages.setMonarchTokensProvider(
                    languageDefinition.id,
                    mod.language,
                );
                monaco.languages.setLanguageConfiguration(
                    languageDefinition.id,
                    mod.conf,
                );
            });
        });
    } else if (language in LanguageIdEnum) {
        setupLanguageFeatures(language as LanguageIdEnum, {
            completionItems: {
                enable: true,
                triggerCharacters: [' ', '.'],
            },
        });
    }
};

const LIGHTDASH_THEME = {
    rules: [
        { token: '', foreground: '333333' },
        { token: 'keyword', foreground: '7262FF', fontStyle: 'bold' },
        { token: 'operator.sql', foreground: '#24cf62', fontStyle: 'bold' },
        { token: 'number', foreground: '098658' },
        { token: 'string', foreground: 'A31515' },
        { token: 'delimiter', foreground: 'A31515' },
        { token: 'identifier', foreground: '001080' },
        { token: 'comment', foreground: '008000', fontStyle: 'italic' },
    ],
    colors: {
        'editor.background': '#FFFFFF',
        'editor.foreground': '#333333',
        'editor.lineHighlightBackground': '#ffffff',
        'editorCursor.foreground': '#7262FF',
        'editorWhitespace.foreground': '#efefef',
        'editor.selectionBackground': '#E6E3FF',
        'editor.selectionForeground': '#333333',
        'editor.wordHighlightBackground': '#bcfeff',
        'editor.selectionHighlightBorder': '#7262FF',
    },
};

const registerCustomCompletionProvider = (
    monaco: Monaco,
    language: string,
    quoteChar: string,
    tables: string[],
) => {
    monaco.languages.registerCompletionItemProvider(language, {
        provideCompletionItems: (model, position) => {
            const wordUntilPosition = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: wordUntilPosition.startColumn,
                endColumn: wordUntilPosition.endColumn,
            };

            const textUntilPosition = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
            });

            const suggestions: languages.CompletionItem[] = tables.map(
                (table) => {
                    const parts = table.split('.');
                    const typedParts = textUntilPosition.split('.');
                    const insertParts = parts.slice(typedParts.length - 1);

                    // Check if the last typed part is already quoted
                    const lastTypedPart = typedParts[typedParts.length - 1];
                    const isLastPartQuoted =
                        lastTypedPart.startsWith(`${quoteChar}`) &&
                        !lastTypedPart.endsWith(`${quoteChar}`);

                    let insertText = insertParts.join('.');
                    if (isLastPartQuoted) {
                        // Remove the opening quote from the first part to insert
                        insertText = insertText.replace(/^${quoteChar}/, '');
                    }
                    return {
                        label: table,
                        kind: monaco.languages.CompletionItemKind.Class,
                        insertText: insertText,
                        range,
                    };
                },
            );

            return { suggestions };
        },
    });
};

const generateTableCompletions = (
    quoteChar: string,
    data: ReturnType<typeof useTables>['data'],
) => {
    if (!data) return;

    const database = data.database;
    const tablesList = data.tablesBySchema
        ?.map((s) =>
            Object.keys(s.tables).map(
                (t) =>
                    `${quoteChar}${database}${quoteChar}.${quoteChar}${s.schema}${quoteChar}.${quoteChar}${t}${quoteChar}`,
            ),
        )
        .flat();

    return tablesList;
};

export const SqlEditor: FC<{
    onSubmit?: () => void;
    highlightText?: MonacoHighlightLine;
    resetHighlightError?: () => void;
}> = ({ onSubmit, highlightText, resetHighlightError }) => {
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const dispatch = useAppDispatch();
    const quoteChar = useAppSelector((state) => state.sqlRunner.quoteChar);
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const { data, isLoading } = useProject(projectUuid);
    const { data: tablesData, isLoading: isTablesDataLoading } = useTables({
        projectUuid,
        search: undefined,
    });
    const editorRef = useRef<Parameters<OnMount>['0'] | null>(null);
    const sqlRef = useRef(sql);
    const onSubmitRef = useRef(onSubmit);

    useEffect(() => {
        sqlRef.current = sql;
        onSubmitRef.current = onSubmit;
    }, [sql, onSubmit]);

    const language = useMemo(
        () => getLanguage(data?.warehouseConnection?.type),
        [data],
    );

    const beforeMount: BeforeMount = useCallback(
        (monaco) => {
            registerMonacoLanguage(monaco, language);
            monaco.editor.defineTheme('lightdash', {
                base: 'vs',
                inherit: true,
                ...LIGHTDASH_THEME,
            });

            if (tablesData && quoteChar) {
                const tablesList = generateTableCompletions(
                    quoteChar,
                    tablesData,
                );
                if (tablesList && tablesList.length > 0) {
                    registerCustomCompletionProvider(
                        monaco,
                        language,
                        quoteChar,
                        tablesList,
                    );
                }
            }
        },
        [language, quoteChar, tablesData],
    );

    const monaco = useMonaco();
    const decorationsCollectionRef =
        useRef<editor.IEditorDecorationsCollection | null>(null); // Ref to store the decorations collection

    const onMount: OnMount = useCallback((editorObj, monacoObj) => {
        editorRef.current = editorObj;
        decorationsCollectionRef.current =
            editorObj.createDecorationsCollection(); // Initialize the decorations collection
        editorObj.addCommand(
            monacoObj.KeyMod.CtrlCmd | monacoObj.KeyCode.Enter,
            () => {
                // When the editor is mounted, the onSubmit callback should be set to the latest value, otherwise it will be set to the initial value on the first render
                onSubmitRef.current?.();
            },
        );
    }, []);

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
        if (!highlightText.end) {
            highlightText.end = {
                line: highlightText.start.line,
                char: highlightText.start.char + 1,
            };
        }
        const range = new monaco.Range(
            highlightText.start.line,
            highlightText.start.char,
            highlightText.end.line,
            highlightText.end.char,
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

    if (isLoading || isTablesDataLoading) {
        return (
            <Center h="100%">
                <Loader color="gray" size="xs" />
            </Center>
        );
    }

    if (!data) {
        return (
            <SuboptimalState
                title="Project data not available"
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
