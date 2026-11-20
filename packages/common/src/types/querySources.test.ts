import { hasReachedSourceQueryLimit, QuerySourceType } from './querySources';

describe('hasReachedSourceQueryLimit', () => {
    test('a node that returned its limit of rows reached it', () => {
        expect(
            hasReachedSourceQueryLimit(
                { sourceType: QuerySourceType.SQL, limit: 100 },
                100,
            ),
        ).toBe(true);
        expect(
            hasReachedSourceQueryLimit(
                { sourceType: QuerySourceType.SQL },
                499,
            ),
        ).toBe(false);
    });

    test('an api node without a limit stops short only when its result says so', () => {
        const api = { sourceType: QuerySourceType.API };
        expect(hasReachedSourceQueryLimit(api, 500)).toBe(false);
        expect(
            hasReachedSourceQueryLimit(api, 500, [
                { type: 'truncated', rowCount: 500, message: 'More rows' },
            ]),
        ).toBe(true);
    });
});
