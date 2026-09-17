import { describe, expect, it, vi } from 'vitest';
import {
    readConnectionFilter,
    writeConnectionFilter,
} from './connectionFilterStorage';

const projectUuid = 'project-uuid';
const connectionUuids = ['connection-a', 'connection-b'];

describe('explore connection filter storage', () => {
    it('remembers a valid filter per project', () => {
        const values = new Map<string, string>();
        const storage = {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
            removeItem: (key: string) => values.delete(key),
        };

        writeConnectionFilter(projectUuid, connectionUuids[1], storage);

        expect(
            readConnectionFilter(projectUuid, connectionUuids, storage),
        ).toBe(connectionUuids[1]);
        expect(
            readConnectionFilter('another-project', connectionUuids, storage),
        ).toBeNull();
    });

    it('clears the saved filter when all connections are selected', () => {
        const removeItem = vi.fn();

        writeConnectionFilter(projectUuid, null, {
            getItem: vi.fn(),
            setItem: vi.fn(),
            removeItem,
        });

        expect(removeItem).toHaveBeenCalledOnce();
    });

    it('ignores stale and inaccessible storage values', () => {
        expect(
            readConnectionFilter(projectUuid, connectionUuids, {
                getItem: () => 'removed-connection',
                setItem: vi.fn(),
                removeItem: vi.fn(),
            }),
        ).toBeNull();
        expect(
            readConnectionFilter(projectUuid, connectionUuids, {
                getItem: () => {
                    throw new Error('storage blocked');
                },
                setItem: vi.fn(),
                removeItem: vi.fn(),
            }),
        ).toBeNull();
    });
});
