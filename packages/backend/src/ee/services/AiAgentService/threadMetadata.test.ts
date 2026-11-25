import {
    AI_THREAD_METADATA_KEY_MAX_LENGTH,
    AI_THREAD_METADATA_MAX_KEYS,
    AI_THREAD_METADATA_VALUE_MAX_LENGTH,
    ParameterError,
} from '@lightdash/common';
import { parseThreadMetadata } from './threadMetadata';

const withKeys = (count: number) =>
    Object.fromEntries(
        Array.from({ length: count }, (_, i) => [`key${i}`, 'v']),
    );

describe('parseThreadMetadata', () => {
    it('returns null when metadata is absent or empty', () => {
        expect(parseThreadMetadata(undefined)).toBeNull();
        expect(parseThreadMetadata(null)).toBeNull();
        expect(parseThreadMetadata({})).toBeNull();
    });

    it('accepts metadata at every limit', () => {
        const metadata = {
            ...withKeys(AI_THREAD_METADATA_MAX_KEYS - 1),
            ['k'.repeat(AI_THREAD_METADATA_KEY_MAX_LENGTH)]: 'v'.repeat(
                AI_THREAD_METADATA_VALUE_MAX_LENGTH,
            ),
        };
        expect(parseThreadMetadata(metadata)).toEqual(metadata);
    });

    it.each([
        ['a non-object', 'user-1'],
        ['an array', ['user-1']],
        ['too many keys', withKeys(AI_THREAD_METADATA_MAX_KEYS + 1)],
        ['an empty key', { ' ': 'v' }],
        [
            'a key over the limit',
            { ['k'.repeat(AI_THREAD_METADATA_KEY_MAX_LENGTH + 1)]: 'v' },
        ],
        ['a non-string value', { user: 42 }],
        [
            'a value over the limit',
            { user: 'v'.repeat(AI_THREAD_METADATA_VALUE_MAX_LENGTH + 1) },
        ],
        ['a NUL character', { user: 'a\u0000b' }],
    ])('rejects %s', (_, metadata) => {
        expect(() => parseThreadMetadata(metadata)).toThrow(ParameterError);
    });
});
