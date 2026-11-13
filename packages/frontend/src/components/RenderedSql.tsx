import { formatSql, getMergeCompiledSqlText } from '@lightdash/common';
import { Alert, Box, Stack, Text, useMantineColorScheme } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import {
    selectTableName,
    useExplorerSelector,
} from '../features/explorer/store';
import { useMergeCompiledSql } from '../features/mergeQuery/hooks/useMergeCompiledSql';
import {
    getLightdashMonacoTheme,
    getMonacoLanguage,
    MONACO_DEFAULT_OPTIONS,
    registerMonacoLanguage,
} from '../features/sqlRunner/utils/monaco';
import { useCompiledSql } from '../hooks/useCompiledSql';
import { useExploreWarehouseConnection } from '../hooks/useExploreWarehouseConnection';
import { useProjectUuid } from '../hooks/useProjectUuid';
import RunningBar from './common/RunningBar';
import SqlSkeleton from './Explorer/SqlCard/SqlSkeleton';
import Editor, { type BeforeMount, type EditorProps } from './MonacoEditor';

const MONACO_READ_ONLY: EditorProps['options'] = {
    ...MONACO_DEFAULT_OPTIONS,
    readOnly: true,
    domReadOnly: true,
    // A viewer, not an editor: no cursor line, guides, folding or ruler
    renderLineHighlight: 'none',
    guides: { indentation: false },
    folding: false,
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    lineNumbersMinChars: 3,
    lineDecorationsWidth: 14,
    padding: { top: 4, bottom: 16 },
    fontSize: 12.5,
    lineHeight: 21,
    scrollbar: {
        useShadows: false,
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
    },
};

const READ_ONLY_LINE_NUMBER_COLOR = { light: '#b4b4bd', dark: '#5c5c66' };

const getReadOnlyTheme = (colorScheme: 'light' | 'dark') => {
    const theme = getLightdashMonacoTheme(colorScheme);
    return {
        ...theme,
        colors: {
            ...theme.colors,
            'editorLineNumber.foreground':
                READ_ONLY_LINE_NUMBER_COLOR[colorScheme],
        },
    };
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
    const tableName = useExplorerSelector(selectTableName);
    const { warehouseType } = useExploreWarehouseConnection(
        tableName,
        projectUuid,
    );
    const language = getMonacoLanguage(warehouseType ?? undefined);
    const { data, error, isInitialLoading } = useCompiledSql();
    // With a merge configured, each leg and then the join are what Run
    // executes; Query A's SQL alone would be SQL that does not run.
    const merge = useMergeCompiledSql();

    const beforeMount: BeforeMount = useCallback(
        (monaco) => {
            registerMonacoLanguage(monaco, language);
            // Own theme names: Monaco themes are global and other editors keep theirs
            monaco.editor.defineTheme('lightdash-light-readonly', {
                base: 'vs',
                inherit: true,
                ...getReadOnlyTheme('light'),
            });
            monaco.editor.defineTheme('lightdash-dark-readonly', {
                base: 'vs-dark',
                inherit: true,
                ...getReadOnlyTheme('dark'),
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
        if (merge.isMergeActive) {
            if (!merge.data) return '';
            return (
                getMergeCompiledSqlText(
                    merge.data,
                    warehouseType ?? undefined,
                ) ?? ''
            );
        }
        const sqlToFormat =
            effectiveView === 'pivotQuery' ? data?.pivotQuery : data?.query;
        if (!sqlToFormat) return '';
        return formatSql(sqlToFormat, warehouseType ?? undefined);
    }, [
        data?.query,
        data?.pivotQuery,
        effectiveView,
        merge.isMergeActive,
        merge.data,
        warehouseType,
    ]);

    const mergeCompileErrors = merge.isMergeActive
        ? (merge.data?.errors ?? [])
        : [];

    if (isInitialLoading || (merge.isMergeActive && merge.isInitialLoading)) {
        return (
            <Box>
                <RunningBar label="Compiling SQL" />
                <SqlSkeleton />
            </Box>
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
                    loading={
                        <Box w="100%" h="100%">
                            <SqlSkeleton />
                        </Box>
                    }
                    language={language}
                    beforeMount={beforeMount}
                    value={formattedSql}
                    options={MONACO_READ_ONLY}
                    theme={
                        colorScheme === 'dark'
                            ? 'lightdash-dark-readonly'
                            : 'lightdash-light-readonly'
                    }
                />
            </Box>
        </Stack>
    );
};
