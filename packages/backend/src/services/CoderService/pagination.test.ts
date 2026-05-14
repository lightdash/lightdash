import { ParameterError } from '@lightdash/common';
import { paginateAsCode } from './pagination';

describe('paginateAsCode', () => {
    const items = [1, 2, 3, 4, 5];

    it('returns the first page when offset is undefined', () => {
        expect(
            paginateAsCode({ items, offset: undefined, pageSize: 2 }),
        ).toEqual({
            page: [1, 2],
            total: 5,
            offset: 2,
        });
    });

    it('treats offset 0 the same as undefined', () => {
        expect(paginateAsCode({ items, offset: 0, pageSize: 2 })).toEqual({
            page: [1, 2],
            total: 5,
            offset: 2,
        });
    });

    it('returns a middle page', () => {
        expect(paginateAsCode({ items, offset: 2, pageSize: 2 })).toEqual({
            page: [3, 4],
            total: 5,
            offset: 4,
        });
    });

    it('caps the next offset at the array length on the final page', () => {
        expect(paginateAsCode({ items, offset: 4, pageSize: 2 })).toEqual({
            page: [5],
            total: 5,
            offset: 5,
        });
    });

    it('returns empty page when offset is at the end', () => {
        expect(paginateAsCode({ items, offset: 5, pageSize: 2 })).toEqual({
            page: [],
            total: 5,
            offset: 5,
        });
    });

    it('returns empty page when offset is past the end without exceeding total', () => {
        expect(paginateAsCode({ items, offset: 99, pageSize: 2 })).toEqual({
            page: [],
            total: 5,
            offset: 5,
        });
    });

    it('returns the full list when page size exceeds total', () => {
        expect(paginateAsCode({ items, offset: 0, pageSize: 100 })).toEqual({
            page: [1, 2, 3, 4, 5],
            total: 5,
            offset: 5,
        });
    });

    it('handles an empty input array', () => {
        expect(
            paginateAsCode<number>({ items: [], offset: 0, pageSize: 10 }),
        ).toEqual({
            page: [],
            total: 0,
            offset: 0,
        });
    });

    it('throws on a negative offset', () => {
        expect(() =>
            paginateAsCode({ items, offset: -1, pageSize: 2 }),
        ).toThrow(ParameterError);
    });
});
