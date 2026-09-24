import { describe, expect, it } from 'vitest';
import {
    readConnectionFilter,
    writeConnectionFilter,
} from './connectionFilterStorage';

const memoryStorage = () => {
    const items = new Map<string, string>();
    return {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => {
            items.set(key, value);
        },
        removeItem: (key: string) => {
            items.delete(key);
        },
    };
};

describe('connection filter storage', () => {
    it('keeps the chosen connection per project', () => {
        const storage = memoryStorage();
        const connectionUuids = ['original-uuid', 'finance-uuid'];

        writeConnectionFilter('project-a', 'finance-uuid', storage);

        expect(
            readConnectionFilter('project-a', connectionUuids, storage),
        ).toBe('finance-uuid');
        expect(
            readConnectionFilter('project-b', connectionUuids, storage),
        ).toBeNull();
    });

    it('ignores a stored connection that the project no longer has', () => {
        const storage = memoryStorage();
        writeConnectionFilter('project-a', 'removed-uuid', storage);

        expect(
            readConnectionFilter('project-a', ['original-uuid'], storage),
        ).toBeNull();
    });

    it('clears the stored connection when the filter is reset', () => {
        const storage = memoryStorage();
        writeConnectionFilter('project-a', 'finance-uuid', storage);
        writeConnectionFilter('project-a', null, storage);

        expect(
            readConnectionFilter('project-a', ['finance-uuid'], storage),
        ).toBeNull();
    });
});
