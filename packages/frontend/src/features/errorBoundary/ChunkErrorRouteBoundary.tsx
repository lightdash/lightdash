import { ERROR_BOUNDARY_ID } from '@lightdash/common';
import { Flex } from '@mantine/core';
import * as Sentry from '@sentry/react';
import { type FC } from 'react';
import { useRouteError } from 'react-router';
import {
    hasRecentChunkReload,
    isChunkLoadErrorObject,
    triggerChunkErrorReload,
} from '../chunkErrorHandler';
import { ChunkErrorFallback, GeneralErrorFallback } from './ErrorFallbacks';

/**
 * Route `errorElement` for react-router. Route-level `lazy` chunk failures are
 * caught by react-router itself and never reach the React ErrorBoundary or the
 * window `unhandledrejection` listener, so they need chunk-aware handling here.
 */
const ChunkErrorRouteBoundary: FC = () => {
    const error = useRouteError();

    if (isChunkLoadErrorObject(error)) {
        if (!hasRecentChunkReload()) {
            triggerChunkErrorReload();
            return null;
        }
        return (
            <Flex
                id={ERROR_BOUNDARY_ID}
                data-error-message="Application update required (chunk load error)"
                justify="flex-start"
                align="center"
                direction="column"
                mt="4xl"
            >
                <ChunkErrorFallback />
            </Flex>
        );
    }

    const eventId = Sentry.captureException(error);

    return (
        <Flex
            id={ERROR_BOUNDARY_ID}
            data-error-message={
                error instanceof Error ? error.message : String(error)
            }
            data-sentry-event-id={eventId}
            justify="flex-start"
            align="center"
            direction="column"
            mt="4xl"
        >
            <GeneralErrorFallback eventId={eventId} error={error} />
        </Flex>
    );
};

export default ChunkErrorRouteBoundary;
