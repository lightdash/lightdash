import { type SummaryExplore } from '@lightdash/common';
import {
    buildExploreTree,
    collectMatchingGroupPaths,
    sortExploreTree,
} from './exploreTree';

const explore = (
    name: string,
    options: { groups?: string[]; groupLabel?: string; label?: string } = {},
): SummaryExplore =>
    ({
        name,
        label: options.label ?? name,
        tags: [],
        databaseName: 'db',
        schemaName: 'schema',
        groups: options.groups,
        groupLabel: options.groupLabel,
    }) as unknown as SummaryExplore;

describe('buildExploreTree', () => {
    it('groups explores by their nested `groups` array', () => {
        const tree = buildExploreTree([
            explore('orders', { groups: ['marketing', 'email'] }),
            explore('signups', { groups: ['marketing', 'email'] }),
            explore('ads', { groups: ['marketing', 'paid'] }),
        ]);

        const sorted = sortExploreTree(tree);
        expect(sorted).toHaveLength(1);
        const marketing = sorted[0];
        expect(marketing.type).toBe('group');
        if (marketing.type !== 'group') return;
        expect(marketing.path).toBe('marketing');

        const subgroups = sortExploreTree(marketing.children);
        expect(subgroups.map((n) => n.key)).toEqual(['email', 'paid']);
        const email = subgroups[0];
        if (email.type !== 'group') return;
        expect(email.path).toBe('marketing/email');
        expect(Object.keys(email.children).sort()).toEqual([
            'orders',
            'signups',
        ]);
    });

    it('falls back to the legacy `groupLabel` when `groups` is missing', () => {
        const tree = buildExploreTree([
            explore('legacy', { groupLabel: 'legacy_group' }),
        ]);
        const sorted = sortExploreTree(tree);
        expect(sorted).toHaveLength(1);
        expect(sorted[0].type).toBe('group');
        if (sorted[0].type !== 'group') return;
        expect(sorted[0].key).toBe('legacy_group');
        expect(Object.keys(sorted[0].children)).toEqual(['legacy']);
    });

    it('uses `tableGroupDetails` to resolve labels & descriptions', () => {
        const tree = buildExploreTree(
            [explore('orders', { groups: ['mktg'] })],
            {
                mktg: { label: 'Marketing', description: 'All marketing' },
            },
        );
        const sorted = sortExploreTree(tree);
        const mktg = sorted[0];
        expect(mktg.type).toBe('group');
        if (mktg.type !== 'group') return;
        expect(mktg.label).toBe('Marketing');
        expect(mktg.description).toBe('All marketing');
    });

    it('falls back to the group key when no detail is provided', () => {
        const tree = buildExploreTree([
            explore('orders', { groups: ['Marketing'] }),
        ]);
        const sorted = sortExploreTree(tree);
        const mktg = sorted[0];
        if (mktg.type !== 'group') return;
        expect(mktg.label).toBe('Marketing');
    });

    it('caps nesting at 3 levels', () => {
        const tree = buildExploreTree([
            explore('orders', { groups: ['a', 'b', 'c', 'd'] }),
        ]);
        let depth = 0;
        let cursor: ReturnType<typeof sortExploreTree>[number] | undefined =
            sortExploreTree(tree)[0];
        while (cursor && cursor.type === 'group') {
            depth += 1;
            cursor = sortExploreTree(cursor.children)[0];
        }
        expect(depth).toBe(3);
    });
});

describe('collectMatchingGroupPaths', () => {
    it('returns paths of groups whose subtree contains a matching explore', () => {
        const tree = buildExploreTree([
            explore('orders', { groups: ['marketing', 'email'] }),
            explore('ads', { groups: ['marketing', 'paid'] }),
            explore('users', { groups: ['ops'] }),
        ]);
        const matches = collectMatchingGroupPaths(tree, new Set(['orders']));
        expect(matches.has('marketing')).toBe(true);
        expect(matches.has('marketing/email')).toBe(true);
        expect(matches.has('marketing/paid')).toBe(false);
        expect(matches.has('ops')).toBe(false);
    });
});
