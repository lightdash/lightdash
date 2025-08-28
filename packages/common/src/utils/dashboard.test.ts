import { type DashboardTile } from '../types/dashboard';
import { ParameterError } from '../types/errors';
import { validateSelectedTabs } from './dashboard';

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
