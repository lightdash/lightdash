import { WarehouseTypes } from '@lightdash/common';
import { Loader } from '@mantine/core';
import Editor, {
    type BeforeMount,
    type EditorProps,
    type Monaco,
    type OnMount,
} from '@monaco-editor/react';
import {
    bigqueryLanguageDefinition,
    snowflakeLanguageDefinition,
} from '@popsql/monaco-sql-languages';
import { IconAlertCircle } from '@tabler/icons-react';
import { LanguageIdEnum, setupLanguageFeatures } from 'monaco-sql-languages';
import { useCallback, useEffect, useMemo, useRef, type FC } from 'react';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useProject } from '../../../hooks/useProject';
import { useAppSelector } from '../store/hooks';

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

export const SqlEditor: FC<{
    sql: string;
    onSqlChange: (value: string) => void;
    onSubmit?: () => void;
}> = ({ sql, onSqlChange, onSubmit }) => {
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const { data, isLoading } = useProject(projectUuid);
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
        },
        [language],
    );

    const onMount: OnMount = useCallback((editor, monaco) => {
        editorRef.current = editor;
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
            // When the editor is mounted, the onSubmit callback should be set to the latest value, otherwise it will be set to the initial value on the first render
            onSubmitRef.current?.();
        });
    }, []);

    if (isLoading) {
        return <Loader color="gray" size="xs" />;
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
            onChange={(value) => onSqlChange(value ?? '')}
            options={MONACO_DEFAULT_OPTIONS}
            theme="lightdash"
        />
    );
};
