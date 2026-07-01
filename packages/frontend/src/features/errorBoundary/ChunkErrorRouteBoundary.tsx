import { ERROR_BOUNDARY_ID } from '@lightdash/common';
import { Flex } from '@mantine/core';
import * as Sentry from '@sentry/react';
import { useEffect, useState, type FC } from 'react';
import { useRouteError } from 'react-router';
import { isChunkLoadErrorObject } from '../chunkErrorHandler';
import { ChunkErrorFallback, GeneralErrorFallback } from './ErrorFallbacks';

/**
 * Route `errorElement` for react-router. Route-level `lazy` chunk failures are
 * caught by react-router itself and never reach the React ErrorBoundary, so they
 * need chunk-aware handling here. We never reload automatically (that would
 * silently discard unsaved editing work); instead we show a manual-refresh
 * fallback and let the user reload on their own terms.
 */
const ChunkErrorRouteBoundary: FC = () => {
    const error = useRouteError();
    const isChunkError = isChunkLoadErrorObject(error);
    const [eventId, setEventId] = useState<string>('');

    // Chunk errors are benign stale-deploy artifacts, so they're kept out of
    // Sentry; capture other errors in an effect so we don't report a side
    // effect (or duplicates) on every render.
    useEffect(() => {
        if (!isChunkError) {
            setEventId(Sentry.captureException(error));
        }
    }, [error, isChunkError]);

    if (isChunkError) {
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
