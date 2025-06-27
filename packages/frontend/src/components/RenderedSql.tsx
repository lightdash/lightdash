import { Alert, Loader, Stack, Title } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useCompiledSql } from '../hooks/useCompiledSql';
import { MonacoSqlEditor } from './common/MonacoSqlEditor';

export const RenderedSql = () => {
    const { data, error, isInitialLoading } = useCompiledSql();

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

    return <MonacoSqlEditor value={data || ''} readOnly={true} />;
};
