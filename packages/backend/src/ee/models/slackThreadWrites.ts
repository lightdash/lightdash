import { AiDuplicateSlackPromptError } from '@lightdash/common';
import { type Knex } from 'knex';
import { isUniqueConstraintViolation } from '../../database/errors';

// Serialises concurrent deliveries of the same Slack event so redeliveries queue
// behind the first writer instead of racing the Slack unique constraints.
export const lockSlackChannel = async (
    trx: Knex.Transaction,
    slackChannelId: string,
): Promise<void> => {
    await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [
        slackChannelId,
    ]);
};

// Callers treat a duplicate Slack prompt as "already answered" and stay silent,
// so the raw constraint violation must never escape a Slack write.
export const toSlackPromptWriteError = (error: unknown): unknown =>
    isUniqueConstraintViolation(error)
        ? new AiDuplicateSlackPromptError('Slack prompt already exists')
        : error;
