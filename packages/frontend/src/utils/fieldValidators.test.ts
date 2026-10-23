import { describe, expect, it } from 'vitest';
import {
    everyValidator,
    hasNoWhiteSpaces,
    isGitRepository,
    isRequired,
    isUppercase,
} from './fieldValidators';

describe('hasNoWhiteSpaces', () => {
    it.each([' myhost', 'my host', 'myhost ', ' ', '  myhost'])(
        'rejects spaces in %j',
        (value) => {
            expect(hasNoWhiteSpaces('Host')(value)).toBe(
                'Host should not have white spaces',
            );
        },
    );

    it.each([undefined, '', 'myhost', 'my-host.example.com', 'org/repository'])(
        'accepts an optional or space-free value %j',
        (value) => {
            expect(hasNoWhiteSpaces('Host')(value)).toBeUndefined();
        },
    );

    it('preserves required-field validation before checking spaces', () => {
        const validate = everyValidator('Host', isRequired, hasNoWhiteSpaces);

        expect(validate('')).toBe('Host is required');
        expect(validate(' ')).toBe('Host is required');
        expect(validate(' myhost')).toBe('Host should not have white spaces');
        expect(validate('myhost')).toBeUndefined();
    });

    it('preserves uppercase validation for warehouse identifiers', () => {
        const validate = everyValidator(
            'Database',
            isUppercase,
            hasNoWhiteSpaces,
        );

        expect(validate('database')).toBe('Database should be uppercase');
        expect(validate(' DATABASE')).toBe(
            'Database should not have white spaces',
        );
        expect(validate('DATABASE')).toBeUndefined();
        expect(validate('')).toBeUndefined();
    });

    it('preserves repository validation for single names and org/name pairs', () => {
        const validate = everyValidator(
            'Repository',
            hasNoWhiteSpaces,
            isGitRepository,
        );

        expect(validate(' org/repository')).toBe(
            'Repository should not have white spaces',
        );
        expect(validate('repository')).toBeUndefined();
        expect(validate('org/repository')).toBeUndefined();
        expect(validate('')).toBeUndefined();
    });
});
