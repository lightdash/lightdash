import { Alert, Loader, Stack, Title } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { format } from 'sql-formatter';
import { getLanguage } from '../features/sqlRunner/store/sqlRunnerSlice';
import { useCompiledSql } from '../hooks/useCompiledSql';
import { useProject } from '../hooks/useProject';
import { SqlEditor } from './CodeMirror';

export const RenderedSql = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: project } = useProject(projectUuid);
    const { data, error, isInitialLoading } = useCompiledSql();

    const formattedSql = useMemo(() => {
        if (!data?.query) return '';
        try {
            return format(data.query, {
                language: getLanguage(project?.warehouseConnection?.type),
            });
        } catch (e) {
            console.error(
                'Error rendering SQL:',
                e instanceof Error ? e.message : 'Unknown error occurred',
            );
            return data.query;
        }
    }, [data?.query, project?.warehouseConnection?.type]);

    if (isInitialLoading) {
        return (
            <Stack my="xs" align="center">
                <Loader size="lg" color="gray" mt="xs" />
                <Title order={4} fw={500} color="gray.7">
                    Compiling SQL
                </Title>
            </Stack>
        );
    }

    if (error?.error.message) {
        return (
            <div style={{ margin: 10 }}>
                <Alert
                    icon={<IconAlertCircle size="1rem" />}
                    title="Compilation error"
                    color="red"
                    variant="filled"
                >
                    <p>{error.error.message}</p>
                </Alert>
            </div>
        );
    } else if (error?.error.data) {
        // Validation error
        return (
            <div style={{ margin: 10 }}>
                <Alert
                    icon={<IconAlertCircle size="1rem" />}
                    title="Compilation error"
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

    return <SqlEditor value={formattedSql} readOnly={true} height="100%" />;
};
