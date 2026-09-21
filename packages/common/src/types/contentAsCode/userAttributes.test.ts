import { describe, expect, it } from 'vitest';
import { parseUserAttributeAsCode } from './parsers';

const document = {
    version: 1,
    name: 'team_id',
    description: null,
    attributeDefaults: null,
    users: [],
    groups: [],
};
describe('parseUserAttributeAsCode', () => {
    it('normalizes email and value ordering', () => {
        expect(
            parseUserAttributeAsCode(
                {
                    ...document,
                    users: [
                        { email: 'JANE@example.com', values: ['b', 'a', 'a'] },
                    ],
                },
                'test.yml',
            ).users,
        ).toEqual([{ email: 'jane@example.com', values: ['a', 'b'] }]);
    });
    it.each([
        { version: 2 },
        { users: undefined },
        { groups: {} },
        { attributeDefaults: 'a' },
        { description: 123 },
        { users: [{ email: 'jane@example.com', values: [1] }] },
        {
            groups: [
                { name: 'Team A', values: ['a'] },
                { name: 'Team A', values: ['b'] },
            ],
        },
        { unexpected: true },
        { users: [{ email: 'jane@example.com', values: ['a'], value: 'b' }] },
    ])('rejects malformed or conflicting input %j', (override) => {
        expect(() =>
            parseUserAttributeAsCode({ ...document, ...override }, 'test.yml'),
        ).toThrow();
    });
});
