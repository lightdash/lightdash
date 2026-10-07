import { AiPrincipalStatus } from '@lightdash/common';
import { Alert, Button, Code, Stack, Text, Title } from '@mantine/core';
import { AiPrincipalStatusBadge } from './AiPrincipalStatusBadge';
import { useTestAiMarker } from './api';

export const AiMarkerTest = ({
    projectUuid,
    connection,
    disabled,
}: {
    projectUuid: string;
    connection: string | null;
    disabled: boolean;
}) => {
    const test = useTestAiMarker(projectUuid, connection);
    return (
        <Stack gap="sm">
            <Title order={4}>Test</Title>
            <Button
                w="fit-content"
                disabled={disabled}
                loading={test.isLoading}
                onClick={() => test.mutate(undefined)}
            >
                Test agent marker
            </Button>
            {test.isError && (
                <Alert color="red">Could not test the agent marker.</Alert>
            )}
            {test.data && (
                <Stack gap="xs">
                    <AiPrincipalStatusBadge
                        principal={{
                            status: test.data.ok
                                ? AiPrincipalStatus.READY
                                : AiPrincipalStatus.FAILED,
                            failureReason: null,
                            statusMessage: test.data.message,
                        }}
                    />
                    <Text size="sm">{test.data.message}</Text>
                    <Code block>
                        {JSON.stringify(test.data.observed, null, 2)}
                    </Code>
                </Stack>
            )}
        </Stack>
    );
};
