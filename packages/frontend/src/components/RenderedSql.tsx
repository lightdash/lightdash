import { formatSql } from '@lightdash/common';
import {
    Alert,
    Box,
    Loader,
    Stack,
    Text,
    Title,
    useMantineColorScheme,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import { useMergeCompiledSql } from '../features/mergeQuery/hooks/useMergeCompiledSql';
import {
    getLightdashMonacoTheme,
    getMonacoLanguage,
    MONACO_DEFAULT_OPTIONS,
    registerMonacoLanguage,
} from '../features/sqlRunner/utils/monaco';
import { useCompiledSql } from '../hooks/useCompiledSql';
import { useProject } from '../hooks/useProject';
import { useProjectUuid } from '../hooks/useProjectUuid';
import Editor, { type BeforeMount, type EditorProps } from './MonacoEditor';

const MONACO_READ_ONLY: EditorProps['options'] = {
    ...MONACO_DEFAULT_OPTIONS,
    readOnly: true,
};

export type SqlViewType = 'query' | 'pivotQuery';

interface RenderedSqlProps {
    selectedView?: SqlViewType;
}

export const RenderedSql: FC<RenderedSqlProps> = ({
    selectedView = 'query',
}) => {
    const { colorScheme } = useMantineColorScheme();
    const projectUuid = useProjectUuid();
    const { data: project } = useProject(projectUuid);
    const language = useMemo(
        () => getMonacoLanguage(project?.warehouseConnection?.type),
        [project],
    );
    const { data, error, isInitialLoading } = useCompiledSql();
    // With a merge configured, the merged statement is what Run executes;
    // Query A's SQL alone would be SQL that does not run.
    const merge = useMergeCompiledSql();

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

    // Fall back to 'query' if 'pivotQuery' is selected but no pivotQuery is available
    const effectiveView = useMemo(
        () =>
            selectedView === 'pivotQuery' && !data?.pivotQuery
                ? 'query'
                : selectedView,
        [selectedView, data?.pivotQuery],
    );

    const formattedSql = useMemo(() => {
        const sqlToFormat = merge.isMergeActive
            ? merge.data?.sql
            : effectiveView === 'pivotQuery'
              ? data?.pivotQuery
              : data?.query;
        if (!sqlToFormat) return '';
        return formatSql(sqlToFormat, project?.warehouseConnection?.type);
    }, [
        data?.query,
        data?.pivotQuery,
        effectiveView,
        merge.isMergeActive,
        merge.data?.sql,
        project?.warehouseConnection?.type,
    ]);

    const mergeCompileErrors = merge.isMergeActive
        ? (merge.data?.errors ?? [])
        : [];

    if (isInitialLoading || (merge.isMergeActive && merge.isInitialLoading)) {
        return (
            <Stack my="xs" align="center">
                <Loader size="lg" color="gray" mt="xs" />
                <Title order={4} fw={500} c="ldGray.7">
                    Compiling SQL
                </Title>
            </Stack>
        );
    }

    if (error?.error.message) {
        return (
            <Box m="sm">
                <Alert
                    icon={<IconAlertCircle size="1rem" />}
                    title="Compilation error"
                    color="red"
                    variant="filled"
                >
                    <Text>{error.error.message}</Text>
                </Alert>
            </Box>
        );
    } else if (error?.error.data) {
        // Validation error
        return (
            <Box m="sm">
                <Alert
                    icon={<IconAlertCircle size="1rem" />}
                    title="Compilation error"
                    color="red"
                    variant="filled"
                >
                    {Object.entries(error.error.data).map(
                        ([key, validation]) => {
                            return (
                                <Text key={key}>
                                    {JSON.stringify(validation)}
                                </Text>
                            );
                        },
                    )}
                </Alert>
            </Box>
        );
    }

    return (
        <Stack gap={0} h="100%">
            {mergeCompileErrors.length > 0 && (
                <Box m="sm">
                    <Alert
                        icon={<IconAlertCircle size="1rem" />}
                        title="This merge cannot compile"
                        color="red"
                        variant="filled"
                    >
                        {mergeCompileErrors.map((mergeError) => (
                            <Text
                                key={`${mergeError.kind}-${mergeError.sourceId ?? ''}`}
                            >
                                {mergeError.message}
                            </Text>
                        ))}
                    </Alert>
                </Box>
            )}
            {data?.compilationErrors && data.compilationErrors.length > 0 && (
                <Box m="sm">
                    <Alert
                        icon={<IconAlertCircle size="1rem" />}
                        title="Compilation error"
                        color="red"
                        variant="filled"
                    >
                        {data.compilationErrors.map(
                            (errorMsg: string, index: number) => (
                                <Text key={index}>{errorMsg}</Text>
                            ),
                        )}
                    </Alert>
                </Box>
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
