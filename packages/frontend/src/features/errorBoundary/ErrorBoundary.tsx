import { ERROR_BOUNDARY_ID } from '@lightdash/common';
import { Flex, type FlexProps } from '@mantine-8/core';
import * as Sentry from '@sentry/react';
import { type FC, type PropsWithChildren } from 'react';
import {
    hasRecentChunkReload,
    isChunkLoadErrorObject,
    triggerChunkErrorReload,
} from '../chunkErrorHandler';
import { ChunkErrorFallback, GeneralErrorFallback } from './ErrorFallbacks';

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
    const errorMessage = isChunkLoadErrorObject(error)
        ? 'Application update required (chunk load error)'
        : error instanceof Error
          ? error.message
          : String(error);

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
                id={ERROR_BOUNDARY_ID}
                data-error-message={errorMessage}
                data-sentry-event-id={eventId}
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
            id={ERROR_BOUNDARY_ID}
            data-error-message={errorMessage}
            data-sentry-event-id={eventId}
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
