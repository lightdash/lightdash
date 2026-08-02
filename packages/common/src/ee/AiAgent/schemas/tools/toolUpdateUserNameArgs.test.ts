import { toolUpdateUserNameArgsSchema } from './toolUpdateUserNameArgs';

describe('toolUpdateUserNameArgsSchema', () => {
    it('accepts and trims valid names', () => {
        const result = toolUpdateUserNameArgsSchema.parse({
            firstName: '  Jane ',
            lastName: ' Doeberry  ',
        });
        expect(result).toEqual({ firstName: 'Jane', lastName: 'Doeberry' });
    });

    it('rejects empty names', () => {
        expect(() =>
            toolUpdateUserNameArgsSchema.parse({
                firstName: '',
                lastName: 'Doe',
            }),
        ).toThrow();
    });

    it('rejects whitespace-only names', () => {
        expect(() =>
            toolUpdateUserNameArgsSchema.parse({
                firstName: '   ',
                lastName: 'Doe',
            }),
        ).toThrow();
    });

    it('rejects missing fields', () => {
        expect(() =>
            toolUpdateUserNameArgsSchema.parse({ firstName: 'Jane' }),
        ).toThrow();
    });

    it('rejects names over 255 characters', () => {
        expect(() =>
            toolUpdateUserNameArgsSchema.parse({
                firstName: 'a'.repeat(256),
                lastName: 'Doe',
            }),
        ).toThrow();
    });
});
