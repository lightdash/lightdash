import { type DashboardTile } from '../types/dashboard';
import { ParameterError } from '../types/errors';
import {
    assertDashboardWithinLimits,
    expandSelectedTabs,
    getDashboardLimitViolations,
    isTileInSelectedTabs,
    validateSelectedTabs,
} from './dashboard';

describe('validateSelectedTabs', () => {
    // Simple mock that focuses on just the tabUuid property
    const mockTiles = [
        { tabUuid: 'tab1' },
        { tabUuid: 'tab2' },
        { tabUuid: null },
        { tabUuid: undefined },
    ] as DashboardTile[];

    it('should not throw when selectedTabs is null', () => {
        expect(() => validateSelectedTabs(null, mockTiles)).not.toThrow();
    });

    it('should not throw when selectedTabs is empty array', () => {
        expect(() => validateSelectedTabs([], mockTiles)).not.toThrow();
    });

    it('should not throw when selectedTabs contains valid tab UUIDs', () => {
        expect(() => validateSelectedTabs(['tab1'], mockTiles)).not.toThrow();
        expect(() =>
            validateSelectedTabs(['tab1', 'tab2'], mockTiles),
        ).not.toThrow();
    });

    it('should throw ParameterError when none of selectedTabs exist in dashboard', () => {
        expect(() =>
            validateSelectedTabs(['nonexistent-tab'], mockTiles),
        ).toThrow(ParameterError);
        expect(() =>
            validateSelectedTabs(['tab1', 'nonexistent-tab'], mockTiles),
        ).not.toThrow(); // Should pass because tab1 exists
    });

    it('should throw ParameterError with informative message', () => {
        expect(() =>
            validateSelectedTabs(['nonexistent-tab'], mockTiles),
        ).toThrow('None of the selected tabs exist in the dashboard');
    });

    it('should handle tiles without tabUuid', () => {
        const tilesWithoutTabUuid = [
            { tabUuid: undefined },
            { tabUuid: null },
        ] as DashboardTile[];

        expect(() =>
            validateSelectedTabs(['any-tab'], tilesWithoutTabUuid),
        ).toThrow('None of the selected tabs exist in the dashboard');
    });
});

describe('isTileInSelectedTabs', () => {
    it('includes every tile when selectedTabs is null', () => {
        expect(isTileInSelectedTabs({ tabUuid: 'tab1' }, null)).toBe(true);
        expect(isTileInSelectedTabs({ tabUuid: null }, null)).toBe(true);
        expect(isTileInSelectedTabs({ tabUuid: undefined }, null)).toBe(true);
    });

    it('includes orphan tiles regardless of selectedTabs (PROD-2505)', () => {
        expect(isTileInSelectedTabs({ tabUuid: null }, ['tab1'])).toBe(true);
        expect(isTileInSelectedTabs({ tabUuid: undefined }, ['tab1'])).toBe(
            true,
        );
    });

    it('includes a tile whose tab is in selectedTabs', () => {
        expect(isTileInSelectedTabs({ tabUuid: 'tab1' }, ['tab1'])).toBe(true);
        expect(
            isTileInSelectedTabs({ tabUuid: 'tab2' }, ['tab1', 'tab2']),
        ).toBe(true);
    });

    it('excludes a tile whose tab is not in selectedTabs', () => {
        expect(isTileInSelectedTabs({ tabUuid: 'tab3' }, ['tab1'])).toBe(false);
    });

    it('excludes non-orphan tiles when selectedTabs is empty', () => {
        expect(isTileInSelectedTabs({ tabUuid: 'tab1' }, [])).toBe(false);
        expect(isTileInSelectedTabs({ tabUuid: null }, [])).toBe(true);
    });
});

describe('expandSelectedTabs', () => {
    it('returns the explicit selection unchanged', () => {
        expect(
            expandSelectedTabs(['tab1'], [{ tabUuid: 'tab1' }]),
        ).toStrictEqual(['tab1']);
        expect(expandSelectedTabs([], [{ tabUuid: 'tab1' }])).toStrictEqual([]);
    });

    it('expands null into every tab UUID present on the tiles, deduplicated', () => {
        expect(
            expandSelectedTabs(null, [
                { tabUuid: 'tab1' },
                { tabUuid: 'tab2' },
                { tabUuid: 'tab1' },
            ]),
        ).toStrictEqual(['tab1', 'tab2']);
    });

    it('includes a null sentinel for orphan tiles', () => {
        expect(
            expandSelectedTabs(null, [
                { tabUuid: 'tab1' },
                { tabUuid: null },
                { tabUuid: undefined },
            ]),
        ).toStrictEqual(['tab1', null]);
    });

    it('returns an empty list for a dashboard without tiles', () => {
        expect(expandSelectedTabs(null, [])).toStrictEqual([]);
    });
});

describe('assertDashboardWithinLimits', () => {
    const limits = { maxTilesPerTab: 2, maxTabsPerDashboard: 2 };
    const tabs = [
        { uuid: 'tab2', name: 'Second', order: 1 },
        { uuid: 'tab1', name: 'First', order: 0 },
    ];

    it('allows dashboards at the limits', () => {
        expect(() =>
            assertDashboardWithinLimits(
                {
                    tiles: [
                        { tabUuid: 'tab1' },
                        { tabUuid: 'tab1' },
                        { tabUuid: 'tab2' },
                        { tabUuid: 'tab2' },
                    ],
                    tabs,
                },
                limits,
            ),
        ).not.toThrow();
    });

    it('rejects too many tabs', () => {
        expect(() =>
            assertDashboardWithinLimits(
                {
                    tiles: [],
                    tabs: [...tabs, { uuid: 'tab3', name: 'Third', order: 2 }],
                },
                limits,
            ),
        ).toThrow(
            new ParameterError(
                'Dashboard has 3 tabs, which is over the limit of 2 tabs per dashboard',
            ),
        );
    });

    it('rejects too many tiles on a dashboard without tabs', () => {
        expect(() =>
            assertDashboardWithinLimits(
                { tiles: [{}, { tabUuid: null }, {}], tabs: [] },
                limits,
            ),
        ).toThrow(
            new ParameterError(
                'Dashboard has 3 tiles, which is over the limit of 2 tiles per tab',
            ),
        );
    });

    it('counts tiles without a tab on the first tab', () => {
        expect(() =>
            assertDashboardWithinLimits(
                {
                    tiles: [{ tabUuid: 'tab1' }, { tabUuid: 'tab1' }, {}],
                    tabs,
                },
                limits,
            ),
        ).toThrow(
            new ParameterError(
                'Tab "First" has 3 tiles, which is over the limit of 2 tiles per tab',
            ),
        );
    });
});

describe('getDashboardLimitViolations', () => {
    it('reports every tab over the tile limit and the tab limit', () => {
        expect(
            getDashboardLimitViolations(
                {
                    tiles: [{ tabUuid: 'a' }, { tabUuid: 'a' }, {}],
                    tabs: [
                        { uuid: 'a', name: 'A', order: 0 },
                        { uuid: 'b', name: 'B', order: 1 },
                    ],
                },
                { maxTilesPerTab: 2, maxTabsPerDashboard: 1 },
            ),
        ).toEqual([
            { type: 'tabs', count: 2, limit: 1 },
            { type: 'tiles', tabUuid: 'a', tabName: 'A', count: 3, limit: 2 },
        ]);
    });
});
