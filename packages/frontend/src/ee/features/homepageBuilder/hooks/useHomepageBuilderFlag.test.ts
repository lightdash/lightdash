import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHomepageBuilderFlag } from './useProjectHomepage';

const state = vi.hoisted(() => ({
    licenseValid: true,
    settings: { enabled: true } as { enabled: boolean } | undefined,
    settingsQueryEnabled: undefined as boolean | undefined,
}));

vi.mock('../../../../providers/App/useApp', () => ({
    default: () => ({
        health: {
            data: { license: { valid: state.licenseValid } },
            isInitialLoading: false,
        },
    }),
}));

vi.mock('./useOrgHomepageSettings', () => ({
    useOrgHomepageSettings: ({ enabled }: { enabled?: boolean } = {}) => {
        state.settingsQueryEnabled = enabled;
        return {
            data: enabled ? state.settings : undefined,
            isInitialLoading: false,
        };
    },
}));

describe('useHomepageBuilderFlag', () => {
    beforeEach(() => {
        state.licenseValid = true;
        state.settings = { enabled: true };
        state.settingsQueryEnabled = undefined;
    });

    it('is on for a licensed org that never opted in', () => {
        const { result } = renderHook(() => useHomepageBuilderFlag());

        expect(result.current.isEnabled).toBe(true);
    });

    it('is off for an org that switched back to the classic homepage', () => {
        state.settings = { enabled: false };
        const { result } = renderHook(() => useHomepageBuilderFlag());

        expect(result.current.isEnabled).toBe(false);
    });

    it('is off without a valid license, and skips the enterprise request', () => {
        state.licenseValid = false;
        const { result } = renderHook(() => useHomepageBuilderFlag());

        expect(result.current.isEnabled).toBe(false);
        expect(state.settingsQueryEnabled).toBe(false);
    });
});
