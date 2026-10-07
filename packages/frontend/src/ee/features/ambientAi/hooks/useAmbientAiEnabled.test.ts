import {
    AiAccessRefusalAction,
    AiAccessRefusalReason,
} from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAiAccessGate } from '../../../../features/aiAccess/useAiAccessGate';
import { useAmbientAiEnabled } from './useAmbientAiEnabled';

const state = vi.hoisted(() => ({
    sharedKey: true,
    copilot: false,
    activeProjectUuid: 'active-project' as string | undefined,
}));

vi.mock('../../../../hooks/health/useHealth', () => ({
    default: () => ({ data: { ai: { isAmbientAiEnabled: state.sharedKey } } }),
}));
vi.mock('../../../../providers/App/useApp', () => ({
    default: () => ({ user: { data: {} } }),
}));
vi.mock('../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: state.copilot } }),
}));
vi.mock('../../../../hooks/useActiveProject', () => ({
    useActiveProjectUuid: () => ({
        activeProjectUuid: state.activeProjectUuid,
    }),
}));
vi.mock('../../../../features/aiAccess/useAiAccessGate', () => ({
    useAiAccessGate: vi.fn(),
}));

describe('useAmbientAiEnabled', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.sharedKey = true;
        state.copilot = false;
        state.activeProjectUuid = 'active-project';
        vi.mocked(useAiAccessGate).mockReturnValue({
            refusal: undefined,
            isLoading: false,
            isError: false,
            refetch: vi.fn(),
            disabled: false,
        });
    });

    it('enables ambient AI without a refusal and uses the explicit project', () => {
        const { result } = renderHook(() =>
            useAmbientAiEnabled('chart-project'),
        );
        expect(result.current).toBe(true);
        expect(useAiAccessGate).toHaveBeenCalledWith('chart-project');
    });

    it('falls back to the active project', () => {
        renderHook(() => useAmbientAiEnabled());
        expect(useAiAccessGate).toHaveBeenCalledWith('active-project');
    });

    it('disables ambient AI while access loads', () => {
        vi.mocked(useAiAccessGate).mockReturnValue({
            refusal: undefined,
            isLoading: true,
            isError: false,
            refetch: vi.fn(),
            disabled: true,
        });
        const { result } = renderHook(() => useAmbientAiEnabled());
        expect(result.current).toBe(false);
    });

    it('disables ambient AI when the access check fails', () => {
        vi.mocked(useAiAccessGate).mockReturnValue({
            refusal: undefined,
            isLoading: false,
            isError: true,
            refetch: vi.fn(),
            disabled: true,
        });
        const { result } = renderHook(() => useAmbientAiEnabled());
        expect(result.current).toBe(false);
    });

    it('disables ambient AI when access is refused', () => {
        vi.mocked(useAiAccessGate).mockReturnValue({
            refusal: {
                code: 'ai_access_refused',
                reason: AiAccessRefusalReason.NEEDS_SIGN_IN,
                action: AiAccessRefusalAction.SIGN_IN,
                message: 'Sign in to run agent queries.',
                settingsUrl: null,
            },
            isLoading: false,
            isError: false,
            refetch: vi.fn(),
            disabled: true,
        });
        const { result } = renderHook(() => useAmbientAiEnabled());
        expect(result.current).toBe(false);
    });

    it.each([
        [false, false, false],
        [false, true, true],
        [true, false, true],
        [true, true, true],
    ])(
        'preserves shared key %s and copilot %s enablement',
        (sharedKey, copilot, expected) => {
            state.sharedKey = sharedKey;
            state.copilot = copilot;
            const { result } = renderHook(() => useAmbientAiEnabled());
            expect(result.current).toBe(expected);
        },
    );
});
