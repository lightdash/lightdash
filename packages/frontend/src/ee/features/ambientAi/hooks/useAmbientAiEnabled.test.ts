import { renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useOptionalAiAccessGate } from '../../../../features/aiAccess/useOptionalAiAccessGate';
import { useAmbientAiEnabled } from './useAmbientAiEnabled';

const state = vi.hoisted(() => ({ sharedKey: true, project: 'route-project' }));
vi.mock('../../../../hooks/health/useHealth', () => ({
    default: () => ({ data: { ai: { isAmbientAiEnabled: state.sharedKey } } }),
}));
vi.mock('../../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => state.project,
}));
vi.mock('../../../../features/aiAccess/useOptionalAiAccessGate', () => ({
    useOptionalAiAccessGate: vi.fn(),
}));
beforeEach(() => {
    vi.clearAllMocks();
    state.sharedKey = true;
    vi.mocked(useOptionalAiAccessGate).mockReturnValue({
        disabled: false,
        refusal: null,
        refetch: vi.fn(),
    });
});
it('forwards explicit project and availability to optional discovery', () => {
    const { result } = renderHook(() => useAmbientAiEnabled('chart-project'));
    expect(result.current).toBe(true);
    expect(useOptionalAiAccessGate).toHaveBeenCalledWith('chart-project', {
        enabled: true,
        ambientAvailable: true,
    });
});
it('uses the route fallback and preserves caller withdrawal', () => {
    state.sharedKey = false;
    renderHook(() => useAmbientAiEnabled(undefined, { enabled: false }));
    expect(useOptionalAiAccessGate).toHaveBeenCalledWith('route-project', {
        enabled: false,
        ambientAvailable: false,
    });
});
it('withholds availability when optional discovery is disabled', () => {
    vi.mocked(useOptionalAiAccessGate).mockReturnValue({
        disabled: true,
        refusal: null,
        refetch: vi.fn(),
    });
    const { result } = renderHook(() => useAmbientAiEnabled());
    expect(result.current).toBe(false);
});
