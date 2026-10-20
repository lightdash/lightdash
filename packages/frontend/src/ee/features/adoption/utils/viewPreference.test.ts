import { describe, expect, it, vi } from 'vitest';
import {
    getViewStorageKey,
    readStoredView,
    resolveAdoptionView,
    writeStoredView,
} from './viewPreference';

const memoryStorage = () => {
    const values = new Map<string, string>();
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
            values.set(key, value);
        },
    };
};

const blocked = () => {
    throw new Error('SecurityError');
};

describe('view preference', () => {
    it('keeps one choice per user', () => {
        const storage = memoryStorage();
        writeStoredView(getViewStorageKey('ada'), 'list', () => storage);
        expect(readStoredView(getViewStorageKey('ada'), () => storage)).toBe(
            'list',
        );
        expect(
            readStoredView(getViewStorageKey('grace'), () => storage),
        ).toBeNull();
    });
    it('reads nothing and writes nothing when storage is blocked', () => {
        expect(readStoredView('key', blocked)).toBeNull();
        expect(() => writeStoredView('key', 'map', blocked)).not.toThrow();
    });
    it('survives a storage that throws on access to its methods', () => {
        const storage = {
            getItem: vi.fn(() => {
                throw new Error('denied');
            }),
            setItem: vi.fn(() => {
                throw new Error('QuotaExceededError');
            }),
        };
        expect(readStoredView('key', () => storage)).toBeNull();
        expect(() =>
            writeStoredView('key', 'list', () => storage),
        ).not.toThrow();
    });
});

describe('resolveAdoptionView', () => {
    it('opens on the map when nothing is stored or requested', () => {
        expect(resolveAdoptionView(null, null)).toBe('map');
    });
    it('uses the remembered view', () => {
        expect(resolveAdoptionView(null, 'list')).toBe('list');
        expect(resolveAdoptionView(null, 'waffle')).toBe('waffle');
    });
    it('lets the link override the remembered view', () => {
        expect(resolveAdoptionView('map', 'list')).toBe('map');
    });
    it('falls back to the map for an unknown stored value', () => {
        expect(resolveAdoptionView(null, 'grid')).toBe('map');
        expect(resolveAdoptionView(null, '')).toBe('map');
    });
});
