import { Box, Button, Group, Loader, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const RECOVERY_TIMER_INTERVAL_MS = 1_000;
const RECOVERY_REFRESH_OFFER_DELAY_SECONDS = 10;

export const StreamRecoveryAlert = () => {
    const { t } = useTranslation('aiCopilotChat');
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    useEffect(() => {
        const startedAt = Date.now();
        const interval = setInterval(() => {
            setElapsedSeconds(
                Math.floor(
                    (Date.now() - startedAt) / RECOVERY_TIMER_INTERVAL_MS,
                ),
            );
        }, RECOVERY_TIMER_INTERVAL_MS);
        return () => clearInterval(interval);
    }, []);

    const showRefresh = elapsedSeconds >= RECOVERY_REFRESH_OFFER_DELAY_SECONDS;

    return (
        <Box bg="yellow.0" px="sm" py={7} bdrs="md">
            <Group gap={8} wrap="nowrap" h={22}>
                <Loader
                    aria-label={t('streamRecovery.ariaLabel')}
                    color="yellow.7"
                    size={14}
                    flex="0 0 auto"
                />
                <Group gap={6} wrap="nowrap" flex={1} miw={0}>
                    <Text
                        size="xs"
                        fw={500}
                        c="yellow.9"
                        style={{
                            flexShrink: 0,
                            fontVariantNumeric: 'tabular-nums',
                        }}
                    >
                        {elapsedSeconds > 0
                            ? t('streamRecovery.reconnectingElapsed', {
                                  seconds: elapsedSeconds,
                              })
                            : t('streamRecovery.reconnecting')}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                        {t('streamRecovery.stillWorking')}
                    </Text>
                </Group>
                {showRefresh && (
                    <Button
                        color="yellow"
                        size="compact-xs"
                        variant="transparent"
                        px={4}
                        styles={{
                            root: {
                                color: 'var(--mantine-color-yellow-9)',
                                flexShrink: 0,
                            },
                        }}
                        onClick={() => window.location.reload()}
                    >
                        {t('streamRecovery.refreshPage')}
                    </Button>
                )}
            </Group>
        </Box>
    );
};
