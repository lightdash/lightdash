import { Box, Button, Flex, Stack, Text, type FlexProps } from '@mantine/core';
import { Prism } from '@mantine/prism';
import * as Sentry from '@sentry/react';
import { IconAlertCircle, IconRefresh } from '@tabler/icons-react';
import { type FC, type PropsWithChildren } from 'react';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import {
    hasRecentChunkReload,
    isChunkLoadErrorObject,
    triggerChunkErrorReload,
} from '../chunkErrorHandler';

/**
 * Fallback UI shown when a chunk load error occurs after auto-reload has failed.
 * This happens when the browser cache is aggressive or there are network issues.
 */
const ChunkErrorFallback: FC = () => (
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
const GeneralErrorFallback: FC<{ eventId: string; error: unknown }> = ({
    eventId,
    error,
}) => (
    <SuboptimalState
        icon={IconAlertCircle}
        title="Something went wrong."
        description={
            <Stack
                spacing="xs"
                sx={(theme) => ({
                    borderRadius: theme.radius.md,
                    padding: theme.spacing.xs,
                    backgroundColor: theme.colors.ldGray[1],
                })}
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

/**
 * Renders the appropriate fallback based on error type.
 * For chunk errors: auto-reload once, then show manual refresh UI.
 * For other errors: show error details with Sentry event ID.
 */
const ErrorFallback: FC<{
    eventId: string;
    error: unknown;
    wrapper?: FlexProps;
}> = ({ eventId, error, wrapper }) => {
    // Check if this is a chunk load error
    if (isChunkLoadErrorObject(error)) {
        // If we haven't recently reloaded, auto-reload now
        if (!hasRecentChunkReload()) {
            triggerChunkErrorReload();
            // Return null while reloading - page will refresh
            return null;
        }
        // Auto-reload already attempted, show manual refresh UI
        return (
            <Flex
                justify="flex-start"
                align="center"
                direction="column"
                {...wrapper}
            >
                <ChunkErrorFallback />
            </Flex>
        );
    }

    // Regular error - show error details
    return (
        <Flex
            justify="flex-start"
            align="center"
            direction="column"
            {...wrapper}
        >
            <GeneralErrorFallback eventId={eventId} error={error} />
        </Flex>
    );
};

const ErrorBoundary: FC<PropsWithChildren & { wrapper?: FlexProps }> = ({
    children,
    wrapper,
}) => {
    return (
        <Sentry.ErrorBoundary
            fallback={({ eventId, error }) => (
                <ErrorFallback
                    eventId={eventId}
                    error={error}
                    wrapper={wrapper}
                />
            )}
        >
            {children}
        </Sentry.ErrorBoundary>
    );
};

export default ErrorBoundary;
