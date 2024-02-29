import { Alert, Loader, Stack, Title } from '@mantine/core';
import { Prism } from '@mantine/prism';
import { IconAlertCircle } from '@tabler/icons-react';
import { useCustomCompiledSql } from '../hooks/useCustomCompiledSql';

const RenderCustomSql = () => {
    const { data, error, isInitialLoading } = useCustomCompiledSql();

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

    if (error) {
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
    }

    return (
        <Prism m="sm" language="sql" withLineNumbers>
            {data || ''}
        </Prism>
    );
};

export default RenderCustomSql;
