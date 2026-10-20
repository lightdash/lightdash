import { IconSearch } from '@tabler/icons-react';
import { describe, expect, it } from 'vitest';
import { filterSettingsNavigation } from '../../../../hooks/settings/filterSettingsNavigation';
import { type SettingsNavigationSection } from '../../../../hooks/settings/types';
import {
    ADOPTION_NAV_KEYWORDS,
    ADOPTION_PATH,
    getDepartmentPath,
    parseAdoptionView,
} from './adoptionNav';

describe('adoption nav', () => {
    const sections: SettingsNavigationSection[] = [
        {
            id: 'organization',
            title: 'Organization settings',
            subtitle: null,
            items: [
                {
                    label: 'Adoption',
                    to: ADOPTION_PATH,
                    icon: IconSearch,
                    keywords: ADOPTION_NAV_KEYWORDS,
                    children: [],
                    exact: true,
                },
            ],
        },
    ];
    it.each(['department', 'headcount', 'rollout'])(
        'is found by searching "%s"',
        (query) => {
            const result = filterSettingsNavigation(sections, query);
            expect(result.flatMap((s) => s.items.map((i) => i.label))).toEqual([
                'Adoption',
            ]);
        },
    );
    it('builds the department page path under the index', () => {
        expect(getDepartmentPath('abc')).toBe('/generalSettings/adoption/abc');
    });
});

describe('parseAdoptionView', () => {
    it('returns the requested view when it is available', () => {
        expect(parseAdoptionView('list', ['map', 'list'])).toBe('list');
    });
    it('falls back to the first available view for missing or unknown values', () => {
        expect(parseAdoptionView(null, ['map', 'list'])).toBe('map');
        expect(parseAdoptionView('grid', ['map', 'list'])).toBe('map');
    });
    it('opens on the map by default', () => {
        expect(parseAdoptionView(null)).toBe('map');
        expect(parseAdoptionView('list')).toBe('list');
        expect(parseAdoptionView('grid')).toBe('map');
    });
    it('ignores a view that is not available yet', () => {
        expect(parseAdoptionView('map', ['list'])).toBe('list');
    });
});
