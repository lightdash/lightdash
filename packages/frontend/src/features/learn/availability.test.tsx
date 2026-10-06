import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    flags: [] as string[],
    health: {
        learnSandbox: { enabled: false },
        softDelete: { enabled: false },
    } as {
        learnSandbox: { enabled: boolean };
        license?: { hasLicenseKey: boolean };
        softDelete: { enabled: boolean };
    },
}));

vi.mock('../../providers/App/useApp', () => ({
    default: () => ({ health: { data: state.health } }),
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: (flag: string) => ({
        data: { enabled: state.flags.includes(flag) },
        isLoading: false,
    }),
}));
vi.mock('../../ee/features/aiCopilot/hooks/useIsCopilotEnabled', () => ({
    useIsCopilotEnabled: () => ({ isCopilotEnabled: false, isLoading: false }),
}));
vi.mock('../../ee/features/aiCopilot/hooks/useAiOrganizationSettings', () => ({
    useAiOrganizationSettings: () => ({ data: {}, isLoading: false }),
}));

import { useLearnAvailability } from './availability';

describe('useLearnAvailability sandbox gate', () => {
    beforeEach(() => {
        state.health = {
            learnSandbox: { enabled: false },
            softDelete: { enabled: false },
        };
    });

    it('is closed when health.learnSandbox.enabled is false', () => {
        const { result } = renderHook(() => useLearnAvailability());
        expect(result.current.isGateOpen('sandbox')).toBe(false);
    });

    it('is open when health.learnSandbox.enabled is true', () => {
        state.health = {
            learnSandbox: { enabled: true },
            softDelete: { enabled: false },
        };
        const { result } = renderHook(() => useLearnAvailability());
        expect(result.current.isGateOpen('sandbox')).toBe(true);
    });

    it('isOpen agrees with isGateOpen for a module gated on sandbox', () => {
        state.health = {
            learnSandbox: { enabled: true },
            softDelete: { enabled: false },
        };
        const { result } = renderHook(() => useLearnAvailability());
        expect(
            result.current.isOpen({
                kind: 'scope',
                scope: 'manage:LearnWorkspace',
                scopes: ['manage:LearnWorkspace'],
                title: '',
                group: 'foundations',
                gate: 'sandbox',
                minRole: null,
                available: true,
                blurb: '',
                stepCount: 0,
            }),
        ).toBe(true);
    });
});

describe('useLearnAvailability documents gate', () => {
    beforeEach(() => {
        state.flags = [];
        state.health = {
            learnSandbox: { enabled: false },
            softDelete: { enabled: false },
        };
    });

    it('is closed while the documents flag is off', () => {
        const { result } = renderHook(() => useLearnAvailability());
        expect(result.current.isGateOpen('documents')).toBe(false);
    });

    it('opens with the documents flag', () => {
        state.flags = ['documents'];
        const { result } = renderHook(() => useLearnAvailability());
        expect(result.current.isGateOpen('documents')).toBe(true);
    });
});
