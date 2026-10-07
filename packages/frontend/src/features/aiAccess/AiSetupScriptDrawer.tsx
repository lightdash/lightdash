import { Alert, Drawer, Stack, Title } from '@mantine/core';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import { useAiSetupScript } from './api';
export const AiSetupScriptDrawer = ({
    projectUuid,
    connection,
    principal,
    onClose,
}: {
    projectUuid: string;
    connection: string | null;
    principal: string | null;
    onClose: () => void;
}) => {
    const query = useAiSetupScript(projectUuid, connection, principal, true);
    return (
        <Drawer opened onClose={onClose} title="Setup script" size="xl">
            <Stack>
                <Alert color="yellow">
                    This script may contain a secret. It is shown to admins
                    only.
                </Alert>
                {query.isLoading && <EmptyStateLoader />}
                {query.isError && (
                    <InlineErrorState
                        message="Could not load the setup script."
                        onRetry={() => void query.refetch()}
                    />
                )}
                {query.data?.parts.map((part) => (
                    <Stack key={part.title} gap="xs">
                        <Title order={5}>{part.title}</Title>
                        <CodeBlock
                            code={part.body}
                            language="sql"
                            copyLabel="Copy setup script"
                        />
                    </Stack>
                ))}
            </Stack>
        </Drawer>
    );
};
