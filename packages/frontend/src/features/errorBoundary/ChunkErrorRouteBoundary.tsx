import { ERROR_BOUNDARY_ID } from '@lightdash/common';
import { Flex } from '@mantine-8/core';
import * as Sentry from '@sentry/react';
import { useEffect, useState, type FC } from 'react';
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
    const isChunkError = isChunkLoadErrorObject(error);
    const [eventId, setEventId] = useState<string>('');

    // Chunk errors are kept out of Sentry until auto-reload fails; capture in an
    // effect so we don't report a side effect (or duplicates) on every render.
    useEffect(() => {
        if (!isChunkError) {
            setEventId(Sentry.captureException(error));
        }
    }, [error, isChunkError]);

    if (isChunkError) {
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
