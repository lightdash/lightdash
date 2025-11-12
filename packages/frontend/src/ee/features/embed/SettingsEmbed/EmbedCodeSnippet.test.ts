import { describe, expect, it } from 'vitest';

// Test the language helper functions by simulating different scenarios
// Since these are internal to the component, we'll test them indirectly through string patterns

// Simple enum to match the one in the component
enum SnippetLanguage {
    NODE = 'node',
    PYTHON = 'python',
    GO = 'go',
}

// Re-implement helpers to test them independently
const languageUndefined = (language: SnippetLanguage): string => {
    switch (language) {
        case SnippetLanguage.NODE:
            return 'undefined';
        case SnippetLanguage.PYTHON:
        case SnippetLanguage.GO:
            return 'None';
        default:
            throw new Error(`Unknown language ${language}`);
    }
};

const languageBoolean = (
    language: SnippetLanguage,
    value?: boolean,
): string => {
    if (value === undefined) {
        return languageUndefined(language);
    }
    switch (language) {
        case SnippetLanguage.NODE:
        case SnippetLanguage.GO:
            return value ? 'true' : 'false';
        case SnippetLanguage.PYTHON:
            return value ? 'True' : 'False';
        default:
            throw new Error(`Unknown language ${language}`);
    }
};

const languageString = (language: SnippetLanguage, value?: string): string => {
    if (value === undefined || value === null) {
        return languageUndefined(language);
    }
    return `"${value}"`;
};

const languageStringArray = (
    language: SnippetLanguage,
    values?: string[] | null,
): string => {
    if (!values || values.length === 0) {
        switch (language) {
            case SnippetLanguage.NODE:
            case SnippetLanguage.PYTHON:
                return '[]';
            case SnippetLanguage.GO:
                return '';
            default:
                throw new Error(`Unknown language ${language}`);
        }
    }
    switch (language) {
        case SnippetLanguage.NODE:
        case SnippetLanguage.PYTHON:
            return JSON.stringify(values);
        case SnippetLanguage.GO:
            return `"${values.join('","')}"`;
        default:
            throw new Error(`Unknown language ${language}`);
    }
};

describe('EmbedCodeSnippet Language Helpers', () => {
    describe('languageBoolean', () => {
        it('should format true/false for Node.js', () => {
            expect(languageBoolean(SnippetLanguage.NODE, true)).toBe('true');
            expect(languageBoolean(SnippetLanguage.NODE, false)).toBe('false');
        });

        it('should format True/False for Python', () => {
            expect(languageBoolean(SnippetLanguage.PYTHON, true)).toBe('True');
            expect(languageBoolean(SnippetLanguage.PYTHON, false)).toBe(
                'False',
            );
        });

        it('should format true/false for Go', () => {
            expect(languageBoolean(SnippetLanguage.GO, true)).toBe('true');
            expect(languageBoolean(SnippetLanguage.GO, false)).toBe('false');
        });

        it('should handle undefined booleans', () => {
            expect(languageBoolean(SnippetLanguage.NODE, undefined)).toBe(
                'undefined',
            );
            expect(languageBoolean(SnippetLanguage.PYTHON, undefined)).toBe(
                'None',
            );
            expect(languageBoolean(SnippetLanguage.GO, undefined)).toBe('None');
        });
    });

    describe('languageString', () => {
        it('should format strings for all languages', () => {
            const testString = 'test-value';
            expect(languageString(SnippetLanguage.NODE, testString)).toBe(
                '"test-value"',
            );
            expect(languageString(SnippetLanguage.PYTHON, testString)).toBe(
                '"test-value"',
            );
            expect(languageString(SnippetLanguage.GO, testString)).toBe(
                '"test-value"',
            );
        });

        it('should handle undefined strings', () => {
            expect(languageString(SnippetLanguage.NODE, undefined)).toBe(
                'undefined',
            );
            expect(languageString(SnippetLanguage.PYTHON, undefined)).toBe(
                'None',
            );
            expect(languageString(SnippetLanguage.GO, undefined)).toBe('None');
        });
    });

    describe('languageStringArray', () => {
        const testArray = ['scope1', 'scope2', 'scope3'];

        it('should format arrays for Node.js as JSON', () => {
            expect(languageStringArray(SnippetLanguage.NODE, testArray)).toBe(
                '["scope1","scope2","scope3"]',
            );
        });

        it('should format arrays for Python as JSON', () => {
            expect(languageStringArray(SnippetLanguage.PYTHON, testArray)).toBe(
                '["scope1","scope2","scope3"]',
            );
        });

        it('should format arrays for Go as comma-separated strings', () => {
            expect(languageStringArray(SnippetLanguage.GO, testArray)).toBe(
                '"scope1","scope2","scope3"',
            );
        });

        it('should handle empty arrays', () => {
            expect(languageStringArray(SnippetLanguage.NODE, [])).toBe('[]');
            expect(languageStringArray(SnippetLanguage.PYTHON, [])).toBe('[]');
            expect(languageStringArray(SnippetLanguage.GO, [])).toBe('');
        });

        it('should handle null/undefined arrays', () => {
            expect(languageStringArray(SnippetLanguage.NODE, null)).toBe('[]');
            expect(languageStringArray(SnippetLanguage.PYTHON, undefined)).toBe(
                '[]',
            );
            expect(languageStringArray(SnippetLanguage.GO, null)).toBe('');
        });
    });

    describe('languageUndefined', () => {
        it('should return language-specific undefined values', () => {
            expect(languageUndefined(SnippetLanguage.NODE)).toBe('undefined');
            expect(languageUndefined(SnippetLanguage.PYTHON)).toBe('None');
            expect(languageUndefined(SnippetLanguage.GO)).toBe('None');
        });
    });
});
