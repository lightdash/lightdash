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
import { buildLearnCatalogue } from './catalogue';

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

describe('useLearnAvailability content-as-code gate', () => {
    beforeEach(() => {
        state.flags = [];
    });

    it('is closed without a licence, even with the sandbox on', () => {
        state.health = {
            learnSandbox: { enabled: true },
            softDelete: { enabled: false },
        };
        const { result } = renderHook(() => useLearnAvailability());
        expect(result.current.isGateOpen('contentAsCode')).toBe(false);
    });

    it('is closed without the sandbox, even with a licence', () => {
        state.health = {
            learnSandbox: { enabled: false },
            license: { hasLicenseKey: true },
            softDelete: { enabled: false },
        };
        const { result } = renderHook(() => useLearnAvailability());
        expect(result.current.isGateOpen('contentAsCode')).toBe(false);
    });

    it('opens with a licence and the sandbox', () => {
        state.health = {
            learnSandbox: { enabled: true },
            license: { hasLicenseKey: true },
            softDelete: { enabled: false },
        };
        const { result } = renderHook(() => useLearnAvailability());
        expect(result.current.isGateOpen('contentAsCode')).toBe(true);
    });
});

describe('useLearnAvailability licence gates', () => {
    const licenceGates = [
        'enterprise',
        'dataApps',
        'aiAgents',
        'contentAsCode',
    ] as const;

    beforeEach(() => {
        state.flags = [];
    });

    it('hides only licence modules without a licence', () => {
        state.health = {
            learnSandbox: { enabled: true },
            softDelete: { enabled: false },
        };
        const { result } = renderHook(() => useLearnAvailability());
        const catalogue = buildLearnCatalogue();
        const open = catalogue.filter(result.current.isOpen);

        licenceGates.forEach((gate) =>
            expect({ gate, open: result.current.isGateOpen(gate) }).toEqual({
                gate,
                open: false,
            }),
        );
        expect(open.some((module) => module.gate === null)).toBe(true);
        expect(open.some((module) => module.gate === 'sandbox')).toBe(true);
        expect(
            open.filter(
                (module) =>
                    module.gate !== null &&
                    (licenceGates as readonly string[]).includes(module.gate),
            ),
        ).toEqual([]);
    });

    it('opens Enterprise modules with a licence, and data apps with their flag', () => {
        state.health = {
            learnSandbox: { enabled: true },
            license: { hasLicenseKey: true },
            softDelete: { enabled: false },
        };
        const { result, rerender } = renderHook(() => useLearnAvailability());
        expect(result.current.isGateOpen('enterprise')).toBe(true);
        expect(result.current.isGateOpen('dataApps')).toBe(false);

        state.flags = ['enable-data-apps'];
        rerender();
        expect(result.current.isGateOpen('dataApps')).toBe(true);
    });
});
