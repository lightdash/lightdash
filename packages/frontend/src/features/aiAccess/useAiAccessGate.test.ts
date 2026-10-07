import {
    AiAccessRefusalAction,
    AiAccessRefusalReason,
    type AiAccessRefusal,
} from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMyAiAccess } from './api';
import { useAiAccessGate } from './useAiAccessGate';

vi.mock('./api', () => ({ useMyAiAccess: vi.fn() }));

const setRefusal = (refusal?: AiAccessRefusal | null) => {
    vi.mocked(useMyAiAccess).mockReturnValue({
        data: { refusal },
    } as ReturnType<typeof useMyAiAccess>);
};

describe('useAiAccessGate', () => {
    it('disables on a refusal and recovers after sign-in', () => {
        const refusal: AiAccessRefusal = {
            code: 'ai_access_refused',
            reason: AiAccessRefusalReason.NEEDS_SIGN_IN,
            action: AiAccessRefusalAction.SIGN_IN,
            message: 'Sign in to run agent queries.',
            settingsUrl: null,
        };
        setRefusal(refusal);
        const { result, rerender } = renderHook(() =>
            useAiAccessGate('project-1'),
        );
        expect(result.current).toEqual({ refusal, disabled: true });
        setRefusal(null);
        rerender();
        expect(result.current).toEqual({ refusal: null, disabled: false });
    });

    it('tracks the project once it is selected and when it changes', () => {
        setRefusal();
        const { result, rerender } = renderHook(
            ({ projectUuid }: { projectUuid?: string }) =>
                useAiAccessGate(projectUuid),
            { initialProps: {} },
        );
        expect(useMyAiAccess).toHaveBeenLastCalledWith(undefined);
        expect(result.current.disabled).toBe(false);
        rerender({ projectUuid: 'project-1' });
        expect(useMyAiAccess).toHaveBeenLastCalledWith('project-1');
        rerender({ projectUuid: 'project-2' });
        expect(useMyAiAccess).toHaveBeenLastCalledWith('project-2');
    });
});
