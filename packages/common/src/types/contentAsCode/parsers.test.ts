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

    it('parses additional custom roles on users and rejects system roles there', () => {
        expect(
            parseUserAsCode(
                {
                    version: 1,
                    email: 'user@example.com',
                    disabled: false,
                    role: { type: 'system', name: 'viewer' },
                    additionalRoles: [
                        { type: 'custom', name: 'Roadmap viewer' },
                    ],
                },
                'user.yml',
            ),
        ).toMatchObject({
            additionalRoles: [{ type: 'custom', name: 'Roadmap viewer' }],
        });
        expect(() =>
            parseUserAsCode(
                {
                    version: 1,
                    email: 'user@example.com',
                    disabled: false,
                    role: { type: 'system', name: 'viewer' },
                    additionalRoles: [{ type: 'system', name: 'admin' }],
                },
                'user.yml',
            ),
        ).toThrow('additionalRoles may only contain custom roles');
    });

    it.each([
        {},
        { firstName: 'José' },
        { lastName: 'Müller' },
        { firstName: '', lastName: '' },
        { firstName: 'José', lastName: 'Müller' },
    ])('preserves optional user name fields: %j', (names) => {
        const document = {
            version: 1,
            email: 'user@example.com',
            disabled: false,
            role: { type: 'system', name: 'viewer' },
            ...names,
        };
        expect(parseUserAsCode(document, 'user.yml')).toStrictEqual(document);
    });

    it('trims supplied user names', () => {
        expect(
            parseUserAsCode(
                {
                    version: 1,
                    email: 'user@example.com',
                    disabled: false,
                    role: { type: 'system', name: 'viewer' },
                    firstName: '  José  ',
                    lastName: '   ',
                },
                'user.yml',
            ),
        ).toMatchObject({ firstName: 'José', lastName: '' });
    });

    it.each(['firstName', 'lastName'] as const)(
        'rejects invalid %s values before upload',
        (field) => {
            for (const value of [null, 1, {}, [], '<b>Alex</b>']) {
                expect(() =>
                    parseUserAsCode(
                        {
                            version: 1,
                            email: 'user@example.com',
                            disabled: false,
                            role: { type: 'system', name: 'viewer' },
                            [field]: value,
                        },
                        'user.yml',
                    ),
                ).toThrow(`user.yml": ${field} must be a string`);
            }
        },
    );

    it('rejects unsupported versions with the source filename', () => {
        expect(() =>
            parseGroupAsCode(
                { version: 2, name: 'Finance', members: [] },
                'finance.yml',
            ),
        ).toThrow('finance.yml');
    });
});
