import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    useFinishDiscardedWork,
    useChatOpen,
    useStudioAgent,
    useStudioThread,
} from './useSemanticStudioChat';

const held = vi.hoisted(() => ({
    editing: true,
    active: null as { workspaceUuid: string } | null,
    mutate: vi.fn(),
    toast: vi.fn(),
    onError: null as ((error: unknown) => void) | null,
}));

vi.mock('../../../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastApiError: held.toast }),
}));

vi.mock('../../hooks/useProjectAiAgents', () => ({
    useAiAgentThread: (
        _project: string,
        _agent: string,
        _thread: string,
        options: { onError: (error: unknown) => void },
    ) => {
        held.onError = options.onError;
        return { data: undefined };
    },
}));

vi.mock('../../../../../features/semanticStudio/useStudioWorkspaces', () => ({
    useActiveStudioWorkspace: () => held.active,
    useStudioWorkspaceAction: () => ({ mutate: held.mutate }),
    useStudioWorkspaces: () => ({ data: undefined }),
}));

vi.mock('../../../../../features/semanticStudio/useSemanticLayerModel', () => ({
    useKeepsSemanticLayerDraft: () => true,
    useCanEditSemanticLayer: () => true,
}));
vi.mock('../../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: held.editing } }),
}));
vi.mock('../Launcher/useDefaultAiAgent', () => ({
    useDefaultAiAgent: () => ({ agent: null, agents: [{ uuid: 'agent' }] }),
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

describe('useStudioThread', () => {
    const fail = (name: string) =>
        act(() =>
            held.onError?.({
                status: 'error',
                error: { name, statusCode: 400, message: 'm', data: {} },
            }),
        );

    beforeEach(() => {
        held.toast.mockReset();
        localStorage.setItem(
            THREAD_KEY,
            JSON.stringify({ threadUuid: 'thread', agentUuid: 'agent' }),
        );
    });

    it('forgets a stored thread that no longer exists, without a toast', () => {
        renderHook(() => useStudioThread('project', 'agent', 'thread'));
        fail('AiAgentNotFoundError');
        expect(JSON.parse(localStorage.getItem(THREAD_KEY) ?? 'null')).toBe(
            null,
        );
        expect(held.toast).not.toHaveBeenCalled();
    });

    it('keeps the thread and says so on any other failure', () => {
        renderHook(() => useStudioThread('project', 'agent', 'thread'));
        fail('UnexpectedServerError');
        expect(JSON.parse(localStorage.getItem(THREAD_KEY) ?? 'null')).toEqual({
            threadUuid: 'thread',
            agentUuid: 'agent',
        });
        expect(held.toast).toHaveBeenCalledOnce();
    });
});

it('uses an accessible agent when no default is selected', () => {
    const { result } = renderHook(() => useStudioAgent('new-project'));
    expect(result.current.agent?.uuid).toBe('agent');
});

it('keeps chat gated when cached project status allows editing but the flag is off', () => {
    held.editing = false;
    try {
        const { result } = renderHook(() => useStudioAgent('project'));
        expect(result.current.isEnabled).toBe(false);
    } finally {
        held.editing = true;
    }
});

it('opens the composer by default even if another project hid its new chat', () => {
    const first = renderHook(() => useChatOpen('first-project'));
    act(() => first.result.current[1](false));
    expect(first.result.current[0]).toBe(false);
    const second = renderHook(() => useChatOpen('second-project'));
    expect(second.result.current[0]).toBe(true);
});
