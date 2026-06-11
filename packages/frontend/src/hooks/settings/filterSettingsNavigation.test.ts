import { IconSearch } from '@tabler/icons-react';
import { describe, expect, it } from 'vitest';
import {
    filterSettingsNavigation,
    searchSettingsNavigationItemsWithPath,
} from './filterSettingsNavigation';
import {
    type SettingsNavigationItem,
    type SettingsNavigationSection,
} from './types';

const item = (
    label: string,
    keywords: string[] = [],
    children: SettingsNavigationItem[] = [],
): SettingsNavigationItem => ({
    label,
    to: `/${label.toLowerCase().replace(/\s+/g, '-')}`,
    icon: IconSearch,
    keywords,
    children,
});

const sections: SettingsNavigationSection[] = [
    {
        id: 'your-settings',
        title: 'Your settings',
        subtitle: null,
        items: [
            item('Profile', ['account', 'avatar']),
            item('Personal access tokens', ['api', 'key', 'pat']),
        ],
    },
    {
        id: 'organization',
        title: 'Organization settings',
        subtitle: null,
        items: [
            item('Single Sign-On', ['sso', 'saml', 'okta']),
            item('User attributes', ['groups']),
            item(
                'Ask AI',
                ['copilot'],
                [
                    item('General', ['settings']),
                    item('Threads', ['conversations']),
                    item('Agents', ['bot']),
                ],
            ),
        ],
    },
];

describe('filterSettingsNavigation', () => {
    it('returns the model unchanged for an empty or whitespace query', () => {
        expect(filterSettingsNavigation(sections, '')).toBe(sections);
        expect(filterSettingsNavigation(sections, '   ')).toBe(sections);
    });

    it('matches by label, ignoring case', () => {
        const result = filterSettingsNavigation(sections, 'PROFILE');
        expect(result.flatMap((s) => s.items.map((i) => i.label))).toContain(
            'Profile',
        );
    });

    it('keeps every section that has a match', () => {
        const multiSection: SettingsNavigationSection[] = [
            {
                id: 'a',
                title: 'A',
                subtitle: null,
                items: [item('Profile', ['account'])],
            },
            {
                id: 'b',
                title: 'B',
                subtitle: null,
                items: [item('Account settings')],
            },
        ];
        const result = filterSettingsNavigation(multiSection, 'account');
        expect(result.map((s) => s.id)).toEqual(['a', 'b']);
    });

    it('keeps every ancestor when a deeply nested item matches', () => {
        const nested: SettingsNavigationSection[] = [
            {
                id: 'root',
                title: 'Root',
                subtitle: null,
                items: [
                    item(
                        'Parent',
                        [],
                        [item('Child', [], [item('Grandchild', ['needle'])])],
                    ),
                ],
            },
        ];
        const [parent] = filterSettingsNavigation(nested, 'needle')[0].items;
        expect(parent.label).toBe('Parent');
        expect(parent.children[0].label).toBe('Child');
        expect(parent.children[0].children[0].label).toBe('Grandchild');
    });

    it('matches by hidden keyword', () => {
        const result = filterSettingsNavigation(sections, 'sso');
        expect(result.flatMap((s) => s.items.map((i) => i.label))).toEqual([
            'Single Sign-On',
        ]);
    });

    it('tolerates fuzzy typos', () => {
        const result = filterSettingsNavigation(sections, 'attributs');
        expect(result.flatMap((s) => s.items.map((i) => i.label))).toContain(
            'User attributes',
        );
    });

    it('keeps all children when the parent matches', () => {
        const result = filterSettingsNavigation(sections, 'ask ai');
        const askAi = result[0].items.find((i) => i.label === 'Ask AI');
        expect(askAi?.children.map((c) => c.label)).toEqual([
            'General',
            'Threads',
            'Agents',
        ]);
    });

    it('keeps the parent but only the matching children when a child matches', () => {
        const result = filterSettingsNavigation(sections, 'threads');
        const askAi = result[0].items.find((i) => i.label === 'Ask AI');
        expect(askAi?.children.map((c) => c.label)).toEqual(['Threads']);
    });

    it('drops sections that have no matching items', () => {
        const result = filterSettingsNavigation(sections, 'profile');
        expect(result.map((s) => s.id)).toEqual(['your-settings']);
    });

    it('returns an empty array when nothing matches', () => {
        expect(filterSettingsNavigation(sections, 'zzz')).toEqual([]);
    });
});

describe('searchSettingsNavigationItemsWithPath', () => {
    it('returns an empty array for an empty or whitespace query', () => {
        expect(searchSettingsNavigationItemsWithPath(sections, '')).toEqual([]);
        expect(searchSettingsNavigationItemsWithPath(sections, '   ')).toEqual(
            [],
        );
    });

    it('materializes a top-level item path as its section title', () => {
        const result = searchSettingsNavigationItemsWithPath(
            sections,
            'profile',
        );
        expect(result.map((r) => r.item.label)).toEqual(['Profile']);
        expect(result[0].path).toEqual(['Your settings']);
    });

    it('materializes a nested item path with its section and ancestors', () => {
        const result = searchSettingsNavigationItemsWithPath(
            sections,
            'threads',
        );
        const threads = result.find((r) => r.item.label === 'Threads');
        expect(threads?.path).toEqual(['Organization settings', 'Ask AI']);
    });

    it('surfaces nested children when an ancestor label matches', () => {
        const result = searchSettingsNavigationItemsWithPath(
            sections,
            'ask ai',
        );
        const general = result.find((r) => r.item.label === 'General');
        expect(general).toBeDefined();
        expect(general?.path).toEqual(['Organization settings', 'Ask AI']);
    });

    it('matches every item in a section by its title', () => {
        const result = searchSettingsNavigationItemsWithPath(
            sections,
            'organization',
        );
        const labels = result.map((r) => r.item.label);
        expect(labels).toEqual(
            expect.arrayContaining([
                'Single Sign-On',
                'User attributes',
                'Ask AI',
                'General',
                'Threads',
                'Agents',
            ]),
        );
        expect(labels).not.toContain('Profile');
    });

    it('returns an empty array when nothing matches', () => {
        expect(searchSettingsNavigationItemsWithPath(sections, 'zzz')).toEqual(
            [],
        );
    });
});
