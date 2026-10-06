import {
    Alert,
    Button,
    Code,
    CopyButton,
    Drawer,
    Loader,
    Stack,
    Title,
} from '@mantine/core';
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
        <Drawer opened onClose={onClose} title="AI setup script" size="xl">
            <Stack>
                <Alert color="yellow">
                    This script may contain a secret. It is shown to admins
                    only.
                </Alert>
                {query.isLoading && <Loader />}
                {query.isError && (
                    <Alert color="red">Could not load the setup script.</Alert>
                )}
                {query.data?.parts.map((part) => (
                    <Stack key={part.title} gap="xs">
                        <Title order={5}>{part.title}</Title>
                        <Code block>{part.body}</Code>
                        <CopyButton value={part.body}>
                            {({ copied, copy }) => (
                                <Button variant="default" onClick={copy}>
                                    {copied ? 'Copied' : 'Copy'}
                                </Button>
                            )}
                        </CopyButton>
                    </Stack>
                ))}
            </Stack>
        </Drawer>
    );
};
