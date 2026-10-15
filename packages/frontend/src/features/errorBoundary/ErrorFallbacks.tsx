import { Box, Button, Stack, Text } from '@mantine/core';
import { IconAlertCircle, IconRefresh } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import { triggerChunkErrorReload } from '../chunkErrorHandler';
import classes from './ErrorFallbacks.module.css';

/**
 * Fallback UI shown when a chunk load error occurs after auto-reload has failed.
 * This happens when the browser cache is aggressive or there are network issues.
 */
export const ChunkErrorFallback: FC = () => {
    const { t } = useTranslation('app');
    return (
        <SuboptimalState
            icon={IconAlertCircle}
            title={t('errorBoundary.updateRequired')}
            description={
                <Box>
                    <Text mb="xs">{t('errorBoundary.newVersion')}</Text>
                    <Text size="sm" c="dimmed">
                        {t('errorBoundary.clearCache')}
                    </Text>
                </Box>
            }
            action={
                <Button
                    variant="default"
                    size="xs"
                    leftSection={<IconRefresh size={16} />}
                    onClick={triggerChunkErrorReload}
                >
                    {t('errorBoundary.refresh')}
                </Button>
            }
        />
    );
};

/**
 * Fallback UI shown for general application errors.
 * Displays error details and Sentry event ID for support.
 */
export const GeneralErrorFallback: FC<{ eventId: string; error: unknown }> = ({
    eventId,
    error,
}) => {
    const { t } = useTranslation('app');
    return (
        <SuboptimalState
            icon={IconAlertCircle}
            title={t('errorBoundary.somethingWentWrong')}
            description={
                <Stack
                    gap="xs"
                    p="xs"
                    bg="ldGray.1"
                    className={classes.errorDetails}
                >
                    <Text>{t('errorBoundary.contactSupport')}</Text>
                    <CodeBlock
                        code={`${t('errorBoundary.errorId', { eventId })}\n${
                            error instanceof Error ? error.toString() : ''
                        }`}
                        language="javascript"
                        maw="400"
                        ta="left"
                    />
                </Stack>
            }
        />
    );
};
