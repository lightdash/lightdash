import {
    AI_THREAD_METADATA_KEY_MAX_LENGTH,
    AI_THREAD_METADATA_MAX_KEYS,
    AI_THREAD_METADATA_VALUE_MAX_LENGTH,
    ParameterError,
    type AiThreadMetadata,
} from '@lightdash/common';

export const parseThreadMetadata = (
    metadata: unknown,
): AiThreadMetadata | null => {
    if (metadata === undefined || metadata === null) return null;
    if (typeof metadata !== 'object' || Array.isArray(metadata)) {
        throw new ParameterError(
            'Thread metadata must be an object of string values',
        );
    }
    const entries = Object.entries(metadata);
    if (entries.length === 0) return null;
    if (entries.length > AI_THREAD_METADATA_MAX_KEYS) {
        throw new ParameterError(
            `Thread metadata can have at most ${AI_THREAD_METADATA_MAX_KEYS} keys`,
        );
    }
    for (const [key, value] of entries) {
        if (key.trim() === '') {
            throw new ParameterError('Thread metadata keys cannot be empty');
        }
        if (key.length > AI_THREAD_METADATA_KEY_MAX_LENGTH) {
            throw new ParameterError(
                `Thread metadata keys must be at most ${AI_THREAD_METADATA_KEY_MAX_LENGTH} characters`,
            );
        }
        if (typeof value !== 'string') {
            throw new ParameterError(
                `Thread metadata value for "${key}" must be a string`,
            );
        }
        if (value.length > AI_THREAD_METADATA_VALUE_MAX_LENGTH) {
            throw new ParameterError(
                `Thread metadata value for "${key}" must be at most ${AI_THREAD_METADATA_VALUE_MAX_LENGTH} characters`,
            );
        }
        // Postgres jsonb rejects the NUL character.
        if (key.includes('\u0000') || value.includes('\u0000')) {
            throw new ParameterError(
                'Thread metadata cannot contain the NUL character',
            );
        }
    }
    return Object.fromEntries(entries);
};
