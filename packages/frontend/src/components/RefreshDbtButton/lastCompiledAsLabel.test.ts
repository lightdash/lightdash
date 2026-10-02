import { describe, expect, test } from 'vitest';
import { lastCompiledAsLabel } from './lastCompiledAsLabel';

describe('lastCompiledAsLabel', () => {
    test('labels a personal compile', () => {
        expect(lastCompiledAsLabel('Ada Lovelace')).toBe(
            "Last compiled as Ada Lovelace's sign-in",
        );
    });

    test('omits the label for a service compile', () => {
        expect(lastCompiledAsLabel(null)).toBeNull();
    });
});
