import { describe, expect, it } from 'vitest';
import {
    parseCustomRoleAsCode,
    parseGroupAsCode,
    parseUserAsCode,
} from './parsers';

describe('content-as-code parsers', () => {
    it('parses compatible organization documents without a contentType', () => {
        expect(
            parseCustomRoleAsCode(
                {
                    version: 1,
                    name: 'Analyst',
                    description: null,
                    level: 'organization',
                    scopes: ['view:Project'],
                },
                'analyst.yml',
            ),
        ).toMatchObject({ name: 'Analyst' });
        expect(
            parseGroupAsCode(
                { version: 1, name: 'Finance', members: [] },
                'finance.yml',
            ),
        ).toMatchObject({ name: 'Finance' });
        expect(
            parseUserAsCode(
                {
                    version: 1,
                    email: 'user@example.com',
                    disabled: false,
                    role: { type: 'custom', name: 'Analyst' },
                },
                'user.yml',
            ),
        ).toMatchObject({ email: 'user@example.com' });
    });

    it('rejects unsupported versions with the source filename', () => {
        expect(() =>
            parseGroupAsCode(
                { version: 2, name: 'Finance', members: [] },
                'finance.yml',
            ),
        ).toThrow('finance.yml');
    });
});
