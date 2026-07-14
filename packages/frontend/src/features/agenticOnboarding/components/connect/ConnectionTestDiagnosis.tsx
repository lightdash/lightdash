import { type ConnectionDiagnosticResult } from '@lightdash/common';
import { Alert, Anchor, Button, Group, Stack, Text } from '@mantine-8/core';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import CopyScriptBlock from './CopyScriptBlock';

type ConnectionTestDiagnosisProps = {
    result: ConnectionDiagnosticResult;
    isRetrying: boolean;
    onRetry: () => void;
};

const ConnectionTestDiagnosis: FC<ConnectionTestDiagnosisProps> = ({
    result,
    isRetrying,
    onRetry,
}) => {
    const failedCheck = result.checks.find((c) => c.status === 'failed');
    const diagnosis = failedCheck?.diagnosis ?? null;

    if (!diagnosis) {
        return (
            <Alert
                color="red"
                icon={<MantineIcon icon={IconAlertTriangle} />}
                title="Connection test failed"
            >
                <Stack gap="sm">
                    <Text size="sm">
                        Something went wrong while testing the connection.
                    </Text>
                    <Button
                        variant="light"
                        loading={isRetrying}
                        leftSection={<MantineIcon icon={IconRefresh} />}
                        onClick={onRetry}
                    >
                        I ran it — retry
                    </Button>
                </Stack>
            </Alert>
        );
    }

    return (
        <Alert
            color="red"
            icon={<MantineIcon icon={IconAlertTriangle} />}
            title={diagnosis.title}
        >
            <Stack gap="sm">
                <Text size="sm">{diagnosis.detail}</Text>

                {diagnosis.remedySql && (
                    <CopyScriptBlock
                        script={diagnosis.remedySql}
                        aria-label="Remedy script"
                    />
                )}

                <Group justify="space-between" wrap="nowrap">
                    {diagnosis.docsUrl ? (
                        <Anchor
                            href={diagnosis.docsUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            size="sm"
                        >
                            View documentation
                        </Anchor>
                    ) : (
                        <span />
                    )}
                    <Button
                        variant="light"
                        loading={isRetrying}
                        leftSection={<MantineIcon icon={IconRefresh} />}
                        onClick={onRetry}
                    >
                        I ran it — retry
                    </Button>
                </Group>

                <Text size="xs" c="dimmed">
                    Passing on the second try is normal — grants can take a
                    moment to apply.
                </Text>
            </Stack>
        </Alert>
    );
};

export default ConnectionTestDiagnosis;
