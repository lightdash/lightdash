import { type AiAccessRefusal } from '@lightdash/common';
import { Box, Button, Group, Paper, Text } from '@mantine/core';
import { IconShieldCheck } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { AiAccessCallout } from './AiAccessCallout';

export const AiAccessGate = ({
    projectUuid,
    refusal,
    isLoading,
    isError,
    refetch,
    variant,
    children,
}: {
    projectUuid: string | undefined;
    refusal: AiAccessRefusal | null | undefined;
    isLoading: boolean;
    isError: boolean;
    refetch: () => Promise<unknown>;
    variant: 'card' | 'inline';
    children: ReactNode;
}) => {
    const [isRetrying, setIsRetrying] = useState(false);

    if (isError || (isRetrying && (isLoading || refusal !== undefined))) {
        return (
            <Paper p="md" mb="md">
                <Group gap="sm" align="flex-start" wrap="nowrap">
                    <MantineIcon icon={IconShieldCheck} color="dimmed" />
                    <Text size="sm" c="dimmed">
                        We could not check your agent connection.{' '}
                        <Button
                            variant="subtle"
                            size="compact-sm"
                            px={0}
                            loading={isRetrying}
                            onClick={async () => {
                                setIsRetrying(true);
                                try {
                                    await refetch();
                                } finally {
                                    setIsRetrying(false);
                                }
                            }}
                        >
                            Try again
                        </Button>
                        .
                    </Text>
                </Group>
            </Paper>
        );
    }

    if (isLoading) {
        return (
            <Box mih={160} data-testid="ai-access-placeholder" aria-hidden />
        );
    }

    if (projectUuid && refusal) {
        return (
            <AiAccessCallout
                projectUuid={projectUuid}
                refusal={refusal}
                variant={variant}
            />
        );
    }

    return <>{children}</>;
};
