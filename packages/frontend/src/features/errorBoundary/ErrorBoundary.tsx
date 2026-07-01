import { ERROR_BOUNDARY_ID } from '@lightdash/common';
import { Flex, type FlexProps } from '@mantine/core';
import * as Sentry from '@sentry/react';
import { type FC, type PropsWithChildren } from 'react';
import { isChunkLoadErrorObject } from '../chunkErrorHandler';
import { ChunkErrorFallback, GeneralErrorFallback } from './ErrorFallbacks';

/**
 * Renders the appropriate fallback based on error type.
 * For chunk errors: show a manual refresh UI (never reload automatically, as
 * that would silently discard unsaved editing work).
 * For other errors: show error details with Sentry event ID.
 */
const ErrorFallback: FC<{
    eventId: string;
    error: unknown;
    wrapper?: FlexProps;
}> = ({ eventId, error, wrapper }) => {
    const isChunkError = isChunkLoadErrorObject(error);
    const errorMessage = isChunkError
        ? 'Application update required (chunk load error)'
        : error instanceof Error
          ? error.message
          : String(error);

    // Chunk load errors get a manual refresh UI; we never reload automatically.
    if (isChunkError) {
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
