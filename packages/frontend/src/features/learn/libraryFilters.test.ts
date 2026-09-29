import { beforeEach, describe, expect, it } from 'vitest';
import {
    libraryPath,
    readLibraryFilters,
    rememberLibrarySearch,
    writeLibraryFilters,
} from './libraryFilters';

describe('readLibraryFilters', () => {
    it('reads the defaults from an empty address', () => {
        expect(readLibraryFilters(new URLSearchParams())).toEqual({
            query: '',
            showExtra: false,
            showSoon: true,
            group: null,
        });
    });

    it('reads every filter from the address', () => {
        expect(
            readLibraryFilters(
                new URLSearchParams('extra=1&soon=0&group=developer&q=pins'),
            ),
        ).toEqual({
            query: 'pins',
            showExtra: true,
            showSoon: false,
            group: 'developer',
        });
    });

    it('treats a group the library does not have as All', () => {
        expect(
            readLibraryFilters(new URLSearchParams('group=nonsense')).group,
        ).toBeNull();
    });
});

describe('writeLibraryFilters', () => {
    it('leaves defaults out of the address', () => {
        const params = writeLibraryFilters(
            new URLSearchParams('extra=1&soon=0&group=developer&q=pins'),
            { query: '', showExtra: false, showSoon: true, group: null },
        );
        expect(params.toString()).toBe('');
    });

    it('keeps parameters that are not filters', () => {
        const params = writeLibraryFilters(new URLSearchParams('lesson=x'), {
            showExtra: true,
        });
        expect(params.get('lesson')).toBe('x');
        expect(params.get('extra')).toBe('1');
    });
});

describe('libraryPath', () => {
    beforeEach(() => sessionStorage.clear());

    it('is the plain library before the learner has filtered it', () => {
        expect(libraryPath('p-1')).toBe('/projects/p-1/learn');
    });

    it('returns to the library as the learner left it', () => {
        rememberLibrarySearch('?extra=1&group=developer');
        expect(libraryPath('p-1')).toBe(
            '/projects/p-1/learn?extra=1&group=developer',
        );
    });

    it('is the plain library once the filters are back to their defaults', () => {
        rememberLibrarySearch('?extra=1');
        rememberLibrarySearch('');
        expect(libraryPath('p-1')).toBe('/projects/p-1/learn');
    });
});
