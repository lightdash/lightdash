import { type ApiError } from '@lightdash/common';
import { Alert, Loader, Stack, Title, useMantineTheme } from '@mantine/core';
import Editor, {
    type BeforeMount,
    type EditorProps,
} from '@monaco-editor/react';
import { IconAlertCircle } from '@tabler/icons-react';
import { type useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, type ComponentProps, type FC } from 'react';
import { useParams } from 'react-router';
import { format } from 'sql-formatter';
import type Table from '../../../components/common/Table';
import { useProject } from '../../../hooks/useProject';
import { getLanguage } from '../../sqlRunner/store/sqlRunnerSlice';
import {
    getLightdashMonacoTheme,
    getMonacoLanguage,
    MONACO_DEFAULT_OPTIONS,
    registerMonacoLanguage,
} from '../../sqlRunner/utils/monaco';

interface Props {
    status: ComponentProps<typeof Table>['status'];
    sql: string | null | undefined;
    error: ReturnType<typeof useQuery<any, ApiError>>['error'];
}

const MetricFlowSqlCode: FC<Props> = ({ status, sql, error }) => {
    const theme = useMantineTheme();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: project } = useProject(projectUuid);
    const language = useMemo(
        () => getMonacoLanguage(project?.warehouseConnection?.type),
        [project],
    );

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

    const formattedSql = useMemo(() => {
        if (!sql) return '';
        try {
            return format(sql, {
                language: getLanguage(project?.warehouseConnection?.type),
            });
        } catch (formatError) {
            console.error(
                'Error rendering SQL:',
                formatError instanceof Error
                    ? formatError.message
                    : 'Unknown error occurred',
            );
            return sql;
        }
    }, [project?.warehouseConnection?.type, sql]);

    const monacoOptions: EditorProps['options'] = useMemo(
        () => ({
            ...MONACO_DEFAULT_OPTIONS,
            readOnly: true,
        }),
        [],
    );

    if (status === 'loading') {
        return (
            <Stack my="xs" align="center">
                <Loader size="lg" color="gray" mt="xs" />
                <Title order={4} fw={500} color="ldGray.7">
                    Loading SQL
                </Title>
            </Stack>
        );
    }

    if (error?.error.message) {
        return (
            <div style={{ margin: 10 }}>
                <Alert
                    icon={<IconAlertCircle size="1rem" />}
                    title="SQL error"
                    color="red"
                    variant="filled"
                >
                    <p>{error.error.message}</p>
                </Alert>
            </div>
        );
    } else if (error?.error.data) {
        return (
            <div style={{ margin: 10 }}>
                <Alert
                    icon={<IconAlertCircle size="1rem" />}
                    title="SQL error"
                    color="red"
                    variant="filled"
                >
                    {Object.entries(error.error.data).map(
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
        <Editor
            loading={<Loader color="gray" size="xs" />}
            language={language}
            beforeMount={beforeMount}
            value={formattedSql}
            options={monacoOptions}
            theme={
                theme.colorScheme === 'dark'
                    ? 'lightdash-dark'
                    : 'lightdash-light'
            }
        />
    );
};

export default MetricFlowSqlCode;
