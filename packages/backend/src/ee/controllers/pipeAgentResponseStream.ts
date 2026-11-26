import * as Sentry from '@sentry/node';
import type express from 'express';
import Logger from '../../logging/logger';
import { type AiAgentService } from '../services/AiAgentService/AiAgentService';

type AgentResponseStream = Awaited<
    ReturnType<AiAgentService['streamAgentThreadResponse']>
>;

const isStreamTimeoutError = (error: unknown) =>
    error instanceof Error &&
    (error.name === 'BodyTimeoutError' ||
        (error.name === 'TypeError' && error.message === 'terminated'));

/** Sends an agent's answer to the client and keeps reading it if the client leaves, so the turn still finishes. */
export const pipeAgentResponseStream = (
    req: express.Request,
    stream: AgentResponseStream,
): void => {
    /**
     * @ref https://github.com/lukeautry/tsoa/issues/44#issuecomment-357784246
     * Hack to get the response object from the request
     */
    stream.pipeUIMessageStreamToResponse(req.res!);

    // If client disconnects, continue consuming the stream so side-effects complete
    let hasConsumed = false;
    const handleClientDisconnect = (err: Error | undefined) => {
        if (hasConsumed) return;
        hasConsumed = true;
        Logger.info(
            `Client disconnected ${
                err ? `with error: ${err.message}` : ''
            }, consuming stream`,
        );
        if (err && !isStreamTimeoutError(err)) {
            Sentry.captureException(err, {
                tags: {
                    errorType: 'AiAgentStreamError',
                },
            });
        }
        void stream.consumeStream({
            onError: (error) => {
                Logger.error(`Error consuming stream ${String(error)}`);
                if (!isStreamTimeoutError(error)) {
                    Sentry.captureException(error, {
                        tags: {
                            errorType: 'AiAgentStreamError',
                        },
                    });
                }
            },
        });
    };
    req.res?.on('finish', () => {
        // If the request is finished, we can stop consuming the stream
        hasConsumed = true;
    });
    req.res?.on('close', handleClientDisconnect);
    req.res?.on('error', handleClientDisconnect);
    req.on('aborted', handleClientDisconnect);
};
