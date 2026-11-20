import {
    agentsReachingPinnedSpaces,
    isOutsideAgentSpaces,
    spaceScopedPinnedUuid,
} from './pinnedOutsideAgentSpaces';

describe('isOutsideAgentSpaces', () => {
    it('treats an agent with no space list as reaching every space', () => {
        expect(isOutsideAgentSpaces([], 'space-1')).toBe(false);
        expect(isOutsideAgentSpaces([], null)).toBe(false);
    });

    it('checks the space against the agent list', () => {
        expect(isOutsideAgentSpaces(['space-1'], 'space-1')).toBe(false);
        expect(isOutsideAgentSpaces(['space-1'], 'space-2')).toBe(true);
    });

    it('keeps personal apps out of a space-limited agent', () => {
        expect(isOutsideAgentSpaces(['space-1'], null)).toBe(true);
    });
});

describe('spaceScopedPinnedUuid', () => {
    it('returns ids for dashboards, charts and data apps only', () => {
        expect(
            spaceScopedPinnedUuid({ type: 'file', path: 'models/a.sql' }),
        ).toBeNull();
        expect(
            spaceScopedPinnedUuid({
                type: 'data_app',
                appUuid: 'app-1',
                appSlug: null,
                displayName: null,
                pinnedVersion: null,
                isPersonal: false,
            }),
        ).toBe('app-1');
    });
});

describe('agentsReachingPinnedSpaces', () => {
    const open = { uuid: 'open', spaceAccess: [] };
    const sales = { uuid: 'sales', spaceAccess: ['space-sales'] };
    const both = { uuid: 'both', spaceAccess: ['space-sales', 'space-ops'] };

    it('keeps agents that may use every pinned space', () => {
        expect(
            agentsReachingPinnedSpaces(
                [open, sales, both],
                ['space-sales', 'space-ops'],
            ),
        ).toEqual([open, both]);
    });

    it('keeps space-limited agents away from personal content', () => {
        expect(agentsReachingPinnedSpaces([open, sales], [null])).toEqual([
            open,
        ]);
    });

    it('keeps every agent when none can reach the pinned spaces', () => {
        expect(agentsReachingPinnedSpaces([sales], ['space-ops'])).toEqual([
            sales,
        ]);
    });

    it('keeps every agent when nothing space-scoped is pinned', () => {
        expect(agentsReachingPinnedSpaces([open, sales], [])).toEqual([
            open,
            sales,
        ]);
    });
});
