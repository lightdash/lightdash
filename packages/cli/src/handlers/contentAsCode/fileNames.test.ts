import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
    allocateContentFileNames,
    assertSafeContentFilePath,
} from './fileNames';

describe('content-as-code filenames', () => {
    it('normalizes unicode and preserves compatibility extensions', () => {
        expect(
            allocateContentFileNames({
                items: [{ identity: 'malaga', displayName: 'Málaga Finance' }],
                fallbackPrefix: 'group',
                extension: '.space.yml',
            }),
        ).toStrictEqual(['malaga-finance.space.yml']);
    });

    it('uses stable identities for unicode-only names and collisions', () => {
        const hash = createHash('sha256')
            .update('party')
            .digest('hex')
            .slice(0, 8);
        expect(
            allocateContentFileNames({
                items: [{ identity: 'party', displayName: '🎉' }],
                fallbackPrefix: 'group',
            }),
        ).toStrictEqual([`group-${hash}.yml`]);

        const names = allocateContentFileNames({
            items: [
                { identity: 'one', displayName: 'Finance' },
                { identity: 'two', displayName: 'finance' },
            ],
            fallbackPrefix: 'group',
        });
        expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(2);
    });

    it('bounds long stems while retaining a stable collision suffix', () => {
        const names = allocateContentFileNames({
            items: [
                { identity: 'one', displayName: 'a'.repeat(500) },
                { identity: 'two', displayName: 'a'.repeat(500) },
            ],
            fallbackPrefix: 'chart',
        });
        expect(names.every((name) => name.length <= 204)).toBe(true);
        expect(names[0]).not.toBe(names[1]);
    });

    it('preserves SQL and URI-encoded compatibility profiles', () => {
        expect(
            allocateContentFileNames({
                items: [
                    {
                        identity: 'orders',
                        displayName: 'Orders',
                        preferredFileName: 'orders.sql.yml',
                    },
                ],
                fallbackPrefix: 'sql-chart',
                extension: '.sql.yml',
            }),
        ).toStrictEqual(['orders.sql.yml']);
        expect(
            allocateContentFileNames({
                items: [
                    {
                        identity: 'finance/view',
                        displayName: 'Finance view',
                        preferredFileName: 'finance%2Fview.yml',
                    },
                ],
                fallbackPrefix: 'virtual-view',
            }),
        ).toStrictEqual(['finance%2Fview.yml']);
    });

    it('reuses an existing file owned by the same identity', () => {
        expect(
            allocateContentFileNames({
                items: [{ identity: 'finance', displayName: 'New name' }],
                fallbackPrefix: 'group',
                existingFileNameByIdentity: new Map([
                    ['finance', 'user-owned-name.yaml'],
                ]),
            }),
        ).toStrictEqual(['user-owned-name.yaml']);
    });

    it('rejects absolute and parent-traversal paths', () => {
        expect(() => assertSafeContentFilePath('../secrets.yml')).toThrow(
            'Unsafe',
        );
        expect(() => assertSafeContentFilePath('/tmp/file.yml')).toThrow(
            'Unsafe',
        );
    });
});
