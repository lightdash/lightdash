import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));

import { type SettingsContext } from './types';
import { useSettingsNavigation } from './useSettingsNavigation';

const context = (overrides: Partial<SettingsContext> = {}) =>
    ({
        user: { ability: { can: () => false } },
        allowPasswordAuthentication: false,
        isMobileAppSetupEnabled: false,
        ...overrides,
    }) as unknown as SettingsContext;

const yourSettingsLabels = (ctx: SettingsContext) => {
    const { result } = renderHook(() => useSettingsNavigation(ctx));
    const section = result.current.find((s) => s.id === 'your-settings');
    return section?.items.map((item) => item.label) ?? [];
};

describe('useSettingsNavigation — Mobile app entry', () => {
    it('is hidden while the instance or the flag says no', () => {
        expect(yourSettingsLabels(context())).not.toContain('Mobile app');
    });

    it('appears once the instance and the flag both say yes', () => {
        const labels = yourSettingsLabels(
            context({ isMobileAppSetupEnabled: true }),
        );

        expect(labels).toContain('Mobile app');
    });

    it('sits after My apps', () => {
        const labels = yourSettingsLabels(
            context({
                isMobileAppSetupEnabled: true,
                dataAppsFlag: {
                    enabled: true,
                } as SettingsContext['dataAppsFlag'],
                user: {
                    ability: { can: (action: string) => action === 'create' },
                } as unknown as SettingsContext['user'],
            }),
        );

        expect(labels.indexOf('Mobile app')).toBe(
            labels.indexOf('My apps') + 1,
        );
    });

    it('points at the settings route', () => {
        const { result } = renderHook(() =>
            useSettingsNavigation(context({ isMobileAppSetupEnabled: true })),
        );
        const entry = result.current
            .find((s) => s.id === 'your-settings')
            ?.items.find((item) => item.label === 'Mobile app');

        expect(entry?.to).toBe('/generalSettings/mobileApp');
    });
});
