import { type AiAccessRefusal } from '@lightdash/common';
import { Box, Button, Group, Paper, Text } from '@mantine/core';
import { IconShieldCheck } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('aiCopilotChat');
    const [isRetrying, setIsRetrying] = useState(false);
    const minHeight = variant === 'card' ? 260 : 160;

    if (isError || (isRetrying && (isLoading || refusal !== null))) {
        return (
            <Box mih={minHeight}>
                <Paper p="md" mb="md">
                    <Group gap="sm" align="flex-start" wrap="nowrap">
                        <MantineIcon icon={IconShieldCheck} color="dimmed" />
                        <Text size="sm" c="dimmed">
                            <Trans
                                t={t}
                                i18nKey="accessGate.checkFailed"
                                components={{
                                    retry: (
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
                                        />
                                    ),
                                }}
                            />
                        </Text>
                    </Group>
                </Paper>
            </Box>
        );
    }

    if (isLoading || (projectUuid && refusal === undefined)) {
        return (
            <Box
                mih={minHeight}
                data-testid="ai-access-placeholder"
                aria-hidden
            />
        );
    }

    if (projectUuid && refusal) {
        return (
            <Box mih={minHeight}>
                <AiAccessCallout
                    projectUuid={projectUuid}
                    refusal={refusal}
                    variant={variant}
                />
            </Box>
        );
    }

    return <>{children}</>;
};
