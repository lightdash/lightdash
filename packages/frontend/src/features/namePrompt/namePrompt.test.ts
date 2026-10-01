import { describe, expect, it } from 'vitest';
import {
    hasSkippedNamePrompt,
    isNameMissing,
    rememberNamePromptSkipped,
} from './namePrompt';

const memoryStorage = () => {
    const values = new Map<string, string>();
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
            values.set(key, value);
        },
    };
};

describe('isNameMissing', () => {
    it('treats whitespace as missing', () => {
        expect(isNameMissing({ firstName: ' ', lastName: 'Lovelace' })).toBe(
            true,
        );
    });

    it('is false when both names are present', () => {
        expect(isNameMissing({ firstName: 'Ada', lastName: 'Lovelace' })).toBe(
            false,
        );
    });
});

describe('name prompt skip', () => {
    it('remembers a skip for that user only', () => {
        const storage = memoryStorage();
        rememberNamePromptSkipped(storage, 'user-1');
        expect(hasSkippedNamePrompt(storage, 'user-1')).toBe(true);
        expect(hasSkippedNamePrompt(storage, 'user-2')).toBe(false);
    });
});
