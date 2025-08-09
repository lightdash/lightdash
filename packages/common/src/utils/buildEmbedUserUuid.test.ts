import { validate as isValidUuid } from 'uuid';
import { buildEmbedUserUuid } from './buildEmbedUserUuid';

describe('buildEmbedUserUuid', () => {
    describe('Deterministic behavior', () => {
        it('should generate different UUIDs for different external IDs', () => {
            const uuid1 = buildEmbedUserUuid('user123');
            const uuid2 = buildEmbedUserUuid('user456');

            expect(uuid1).not.toBe(uuid2);
        });

        it('should generate consistent UUIDs for various input types', () => {
            const testCases = [
                'simple-user',
                'user-with-dashes',
                'user_with_underscores',
                'user123',
                'USER123',
                'user@domain.com',
                'user+tag@domain.com',
                'user with spaces',
                'user\twith\ttabs',
                'user\nwith\nnewlines',
            ];

            testCases.forEach((externalId) => {
                const uuid1 = buildEmbedUserUuid(externalId);
                const uuid2 = buildEmbedUserUuid(externalId);

                expect(uuid1).toBe(uuid2);
                expect(isValidUuid(uuid1)).toBe(true);
            });
        });
    });

    describe('UUID format validation', () => {
        it('should generate a valid UUID-like format (8-4-4-4-12 characters)', () => {
            const uuid = buildEmbedUserUuid('test-user');

            expect(isValidUuid(uuid)).toBe(true);
        });
    });

    describe('MD5 hash verification', () => {
        it('should generate UUID based on MD5 hash of external ID', () => {
            const uuid = buildEmbedUserUuid('test-user');
            expect(uuid).toBe('42b27efc-1480-44fe-8d7e-aa5eec47424d');
        });

        it('should throw an error for empty string input', () => {
            expect(() => buildEmbedUserUuid('')).toThrow(
                'External ID is required to build an embed user UUID',
            );
        });
    });

    describe('Edge cases', () => {
        it('should handle special characters in external ID', () => {
            const uuid1 = buildEmbedUserUuid('user@example.com');
            const uuid2 = buildEmbedUserUuid('user@example.com');

            expect(uuid1).toBe(uuid2);
            expect(isValidUuid(uuid1)).toBe(true);
        });

        it('should handle unicode characters', () => {
            const uuid1 = buildEmbedUserUuid('用户123');
            const uuid2 = buildEmbedUserUuid('用户123');

            expect(uuid1).toBe(uuid2);
            expect(isValidUuid(uuid1)).toBe(true);
        });

        it('should handle very long external IDs', () => {
            const longId = 'a'.repeat(1000);
            const uuid = buildEmbedUserUuid(longId);

            expect(isValidUuid(uuid)).toBe(true);
        });
    });
});
