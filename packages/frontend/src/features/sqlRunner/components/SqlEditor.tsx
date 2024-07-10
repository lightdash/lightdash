import { WarehouseTypes } from '@lightdash/common';
import { Loader } from '@mantine/core';
import Editor, { type EditorProps, type Monaco } from '@monaco-editor/react';
import {
    bigqueryLanguageDefinition,
    snowflakeLanguageDefinition,
} from '@popsql/monaco-sql-languages';
import { IconAlertCircle } from '@tabler/icons-react';
import { LanguageIdEnum, setupLanguageFeatures } from 'monaco-sql-languages';
import React, { useCallback, useMemo, type FC } from 'react';
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

export const SqlEditor: FC<{
    sql: string;
    onSqlChange: (value: string) => void;
}> = ({ sql, onSqlChange }) => {
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const { data, isLoading } = useProject(projectUuid);

    const language = useMemo(
        () => getLanguage(data?.warehouseConnection?.type),
        [data],
    );
    const beforeMount = useCallback(
        (monaco: Monaco) => {
            registerMonacoLanguage(monaco, language);
        },
        [language],
    );

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
            language={language}
            value={sql}
            onChange={(value) => onSqlChange(value ?? '')}
            options={MONACO_DEFAULT_OPTIONS}
        />
    );
};
