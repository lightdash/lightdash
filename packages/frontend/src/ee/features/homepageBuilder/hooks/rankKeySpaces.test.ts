import { describe, expect, it } from 'vitest';
import { rankKeySpaces, type RankableSpace } from './rankKeySpaces';

const space = (overrides: Partial<RankableSpace> = {}): RankableSpace => ({
    uuid: 'u',
    name: 'Space',
    dashboardCount: 1,
    chartCount: 0,
    appCount: 0,
    isPinned: false,
    ...overrides,
});

describe('rankKeySpaces', () => {
    it('puts pinned spaces first — an admin pinning one has already answered', () => {
        const ranked = rankKeySpaces(
            [
                space({ uuid: 'big', name: 'Big', chartCount: 50 }),
                space({ uuid: 'pinned', name: 'Pinned', isPinned: true }),
            ],
            new Map([['big', 900]]),
            4,
        );
        expect(ranked.map((s) => s.uuid)).toEqual(['pinned', 'big']);
    });

    it('ranks unpinned spaces by the views of the content inside them', () => {
        const ranked = rankKeySpaces(
            [
                space({ uuid: 'quiet', name: 'Quiet', chartCount: 40 }),
                space({ uuid: 'busy', name: 'Busy', chartCount: 2 }),
            ],
            new Map([
                ['busy', 500],
                ['quiet', 3],
            ]),
            4,
        );
        expect(ranked.map((s) => s.uuid)).toEqual(['busy', 'quiet']);
    });

    it('falls back to item count when nothing has been viewed yet', () => {
        const ranked = rankKeySpaces(
            [
                space({ uuid: 'small', name: 'Small', chartCount: 1 }),
                space({ uuid: 'large', name: 'Large', chartCount: 9 }),
            ],
            new Map(),
            4,
        );
        expect(ranked.map((s) => s.uuid)).toEqual(['large', 'small']);
    });

    it('never sends someone to an empty space', () => {
        const ranked = rankKeySpaces(
            [
                space({
                    uuid: 'empty',
                    dashboardCount: 0,
                    chartCount: 0,
                    appCount: 0,
                }),
                space({ uuid: 'has-content', chartCount: 1 }),
            ],
            new Map(),
            4,
        );
        expect(ranked.map((s) => s.uuid)).toEqual(['has-content']);
    });

    it('counts apps towards a space being worth showing', () => {
        const ranked = rankKeySpaces(
            [
                space({
                    uuid: 'apps-only',
                    dashboardCount: 0,
                    chartCount: 0,
                    appCount: 3,
                }),
            ],
            new Map(),
            4,
        );
        expect(ranked).toHaveLength(1);
        expect(ranked[0].itemCount).toBe(3);
    });

    it('caps at the limit, breaking ties by name for a stable order', () => {
        const ranked = rankKeySpaces(
            [
                space({ uuid: 'c', name: 'Charlie' }),
                space({ uuid: 'a', name: 'Alpha' }),
                space({ uuid: 'b', name: 'Bravo' }),
            ],
            new Map(),
            2,
        );
        expect(ranked.map((s) => s.name)).toEqual(['Alpha', 'Bravo']);
    });
});
