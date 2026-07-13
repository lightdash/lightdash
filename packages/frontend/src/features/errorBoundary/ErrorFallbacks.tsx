import { Box, Button, Stack, Text } from '@mantine-8/core';
import { Prism } from '@mantine/prism';
import { IconAlertCircle, IconRefresh } from '@tabler/icons-react';
import { type FC } from 'react';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import { triggerChunkErrorReload } from '../chunkErrorHandler';
import classes from './ErrorFallbacks.module.css';

/**
 * Fallback UI shown when a chunk load error occurs after auto-reload has failed.
 * This happens when the browser cache is aggressive or there are network issues.
 */
export const ChunkErrorFallback: FC = () => (
    <SuboptimalState
        icon={IconAlertCircle}
        title="Application update required"
        description={
            <Box>
                <Text mb="xs">
                    A new version of Lightdash is available. Please refresh your
                    browser to load the latest version.
                </Text>
                <Text size="sm" c="dimmed">
                    If this persists after refreshing, try clearing your browser
                    cache or opening in an incognito window.
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
                Refresh page
            </Button>
        }
    />
);

/**
 * Fallback UI shown for general application errors.
 * Displays error details and Sentry event ID for support.
 */
export const GeneralErrorFallback: FC<{ eventId: string; error: unknown }> = ({
    eventId,
    error,
}) => (
    <SuboptimalState
        icon={IconAlertCircle}
        title="Something went wrong."
        description={
            <Stack
                gap="xs"
                p="xs"
                bg="ldGray.1"
                className={classes.errorDetails}
            >
                <Text>You can contact support with the following error ID</Text>
                <Prism
                    language="javascript"
                    ta="left"
                    maw="400"
                    styles={{ copy: { right: 0 } }}
                >
                    {`Error ID: ${eventId}\n${
                        error instanceof Error ? error.toString() : ''
                    }`}
                </Prism>
            </Stack>
        }
    />
);
