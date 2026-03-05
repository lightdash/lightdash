import { type ApiError } from '@lightdash/common';
import {
    Alert,
    Box,
    Loader,
    Stack,
    Title,
    useMantineColorScheme,
} from '@mantine-8/core';
import Editor, {
    type BeforeMount,
    type EditorProps,
} from '@monaco-editor/react';
import { IconAlertCircle } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import { useParams } from 'react-router';
import { format } from 'sql-formatter';
import { getLanguage } from '../features/sqlRunner/store/sqlRunnerSlice';
import {
    getLightdashMonacoTheme,
    getMonacoLanguage,
    MONACO_DEFAULT_OPTIONS,
    registerMonacoLanguage,
} from '../features/sqlRunner/utils/monaco';
import { useCompiledSql } from '../hooks/useCompiledSql';
import { useProject } from '../hooks/useProject';

const MONACO_READ_ONLY: EditorProps['options'] = {
    ...MONACO_DEFAULT_OPTIONS,
    readOnly: true,
};

export type SqlViewType = 'query' | 'pivotQuery';

interface RenderedSqlProps {
    selectedView?: SqlViewType;
    sqlOverride?: string;
    isLoadingOverride?: boolean;
    errorOverride?: ApiError | null;
}

export const RenderedSql: FC<RenderedSqlProps> = ({
    selectedView = 'query',
    sqlOverride,
    isLoadingOverride,
    errorOverride,
}) => {
    const { colorScheme } = useMantineColorScheme();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: project } = useProject(projectUuid);
    const language = useMemo(
        () => getMonacoLanguage(project?.warehouseConnection?.type),
        [project],
    );
    const { data, error, isInitialLoading } = useCompiledSql();

    const effectiveIsLoading = isLoadingOverride ?? isInitialLoading;
    const effectiveError = errorOverride !== undefined ? errorOverride : error;

    const beforeMount: BeforeMount = useCallback(
        (monaco) => {
            registerMonacoLanguage(monaco, language);
            monaco.editor.defineTheme('lightdash-light', {
                base: 'vs',
                inherit: true,
                ...getLightdashMonacoTheme('light'),
            });
            monaco.editor.defineTheme('lightdash-dark', {
                base: 'vs-dark',
                inherit: true,
                ...getLightdashMonacoTheme('dark'),
            });
        },
        [language],
    );

    const formatSql = useCallback(
        (sql: string | undefined) => {
            if (!sql) return '';
            try {
                return format(sql, {
                    language: getLanguage(project?.warehouseConnection?.type),
                });
            } catch (e) {
                console.error(
                    'Error rendering SQL:',
                    e instanceof Error ? e.message : 'Unknown error occurred',
                );
                return sql;
            }
        },
        [project?.warehouseConnection?.type],
    );

    // Fall back to 'query' if 'pivotQuery' is selected but no pivotQuery is available
    const effectiveView = useMemo(
        () =>
            selectedView === 'pivotQuery' && !data?.pivotQuery
                ? 'query'
                : selectedView,
        [selectedView, data?.pivotQuery],
    );

    const formattedSql = useMemo(() => {
        if (sqlOverride !== undefined) {
            return formatSql(sqlOverride);
        }
        const sqlToFormat =
            effectiveView === 'pivotQuery' ? data?.pivotQuery : data?.query;
        return formatSql(sqlToFormat);
    }, [sqlOverride, data?.query, data?.pivotQuery, effectiveView, formatSql]);

    if (effectiveIsLoading) {
        return (
            <Stack my="xs" align="center">
                <Loader size="lg" color="gray" mt="xs" />
                <Title order={4} fw={500} c="ldGray.7">
                    Compiling SQL
                </Title>
            </Stack>
        );
    }

    if (effectiveError?.error.message) {
        return (
            <div style={{ margin: 10 }}>
                <Alert
                    icon={<IconAlertCircle size="1rem" />}
                    title="Compilation error"
                    color="red"
                    variant="filled"
                >
                    <p>{effectiveError.error.message}</p>
                </Alert>
            </div>
        );
    } else if (effectiveError?.error.data) {
        // Validation error
        return (
            <div style={{ margin: 10 }}>
                <Alert
                    icon={<IconAlertCircle size="1rem" />}
                    title="Compilation error"
                    color="red"
                    variant="filled"
                >
                    {Object.entries(effectiveError.error.data).map(
                        ([key, validation]) => {
                            return (
                                <p key={key}>{JSON.stringify(validation)}</p>
                            );
                        },
                    )}
                </Alert>
            </div>
        );
    }

    return (
        <Stack gap={0} h="100%">
            {data?.compilationErrors && data.compilationErrors.length > 0 && (
                <div style={{ margin: 10 }}>
                    <Alert
                        icon={<IconAlertCircle size="1rem" />}
                        title="Compilation error"
                        color="red"
                        variant="filled"
                    >
                        {data.compilationErrors.map(
                            (errorMsg: string, index: number) => (
                                <p key={index}>{errorMsg}</p>
                            ),
                        )}
                    </Alert>
                </div>
            )}
            <Box flex={1}>
                <Editor
                    loading={<Loader color="gray" size="xs" />}
                    language={language}
                    beforeMount={beforeMount}
                    value={formattedSql}
                    options={MONACO_READ_ONLY}
                    theme={
                        colorScheme === 'dark'
                            ? 'lightdash-dark'
                            : 'lightdash-light'
                    }
                />
            </Box>
        </Stack>
    );
};
