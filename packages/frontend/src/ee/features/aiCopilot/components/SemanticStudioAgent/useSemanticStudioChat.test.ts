import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFinishDiscardedWork } from './useSemanticStudioChat';

const held = vi.hoisted(() => ({
    active: null as { workspaceUuid: string } | null,
    mutate: vi.fn(),
}));

vi.mock('../../../../../features/semanticStudio/useStudioWorkspaces', () => ({
    useActiveStudioWorkspace: () => held.active,
    useStudioWorkspaceAction: () => ({ mutate: held.mutate }),
    useStudioWorkspaces: () => ({ data: undefined }),
}));

const THREAD_KEY = 'semantic-studio-agent-thread-project';

describe('useFinishDiscardedWork', () => {
    beforeEach(() => {
        held.mutate.mockReset();
        localStorage.setItem(
            THREAD_KEY,
            JSON.stringify({ threadUuid: 'thread', agentUuid: 'agent' }),
        );
    });

    it('finishes the active workspace and closes its chat', () => {
        held.active = { workspaceUuid: 'workspace' };
        const { result } = renderHook(() => useFinishDiscardedWork('project'));
        act(() => result.current());
        expect(held.mutate).toHaveBeenCalledWith({
            kind: 'finish',
            workspaceUuid: 'workspace',
        });
        expect(JSON.parse(localStorage.getItem(THREAD_KEY) ?? 'null')).toBe(
            null,
        );
    });

    it('still closes the chat when no workspace is active', () => {
        held.active = null;
        const { result } = renderHook(() => useFinishDiscardedWork('project'));
        act(() => result.current());
        expect(held.mutate).not.toHaveBeenCalled();
        expect(JSON.parse(localStorage.getItem(THREAD_KEY) ?? 'null')).toBe(
            null,
        );
    });
});
