import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    useStoredStudioThread,
    type StoredThread,
} from '../../../../../features/semanticStudio/studioChange';
import {
    useCompileFollowUp,
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
    compile: null as {
        status: 'compiling' | 'ready' | 'failed';
        requestedByAgent: boolean;
        compileRequestUuid: string;
    } | null,
    claim: vi.fn(),
    send: vi.fn(),
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
    useCreateAgentThreadMessageMutation: () => ({ mutate: held.send }),
}));

vi.mock('../../../../../features/semanticStudio/useStudioWorkspaces', () => ({
    useActiveStudioWorkspace: () => held.active,
    useStudioWorkspaceAction: () => ({ mutate: held.mutate }),
    useStudioWorkspaces: () => ({ data: undefined }),
}));

vi.mock('../../../../../features/semanticStudio/useSemanticLayerModel', () => ({
    useKeepsSemanticLayerDraft: () => true,
    useCanEditSemanticLayer: () => true,
    useDraftCheckout: () => ({ data: { branchCompile: held.compile } }),
    useClaimCompileFollowUp: () => ({ mutateAsync: held.claim }),
}));
vi.mock('../../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: held.editing } }),
}));
vi.mock('../Launcher/useDefaultAiAgent', () => ({
    useDefaultAiAgent: () => ({ agent: null, agents: [{ uuid: 'agent' }] }),
}));

// Each read mounts a fresh hook, so a value has to survive a remount to be seen.
const storedThread = () =>
    renderHook(() => useStoredStudioThread('project')).result.current[0];
const storeThread = (thread: StoredThread | null) => {
    const { result } = renderHook(() => useStoredStudioThread('project'));
    act(() => result.current[1](thread));
};

describe('useFinishDiscardedWork', () => {
    beforeEach(() => {
        held.mutate.mockReset();
        storeThread({ threadUuid: 'thread', agentUuid: 'agent' });
    });

    it('finishes the active workspace and closes its chat', () => {
        held.active = { workspaceUuid: 'workspace' };
        const { result } = renderHook(() => useFinishDiscardedWork('project'));
        act(() => result.current());
        expect(held.mutate).toHaveBeenCalledWith({
            kind: 'finish',
            workspaceUuid: 'workspace',
        });
        expect(storedThread()).toBe(null);
    });

    it('still closes the chat when no workspace is active', () => {
        held.active = null;
        const { result } = renderHook(() => useFinishDiscardedWork('project'));
        act(() => result.current());
        expect(held.mutate).not.toHaveBeenCalled();
        expect(storedThread()).toBe(null);
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
        storeThread({ threadUuid: 'thread', agentUuid: 'agent' });
    });

    it('forgets a stored thread that no longer exists, without a toast', () => {
        renderHook(() => useStudioThread('project', 'agent', 'thread'));
        fail('AiAgentNotFoundError');
        expect(storedThread()).toBe(null);
        expect(held.toast).not.toHaveBeenCalled();
    });

    it('keeps the thread and says so on any other failure', () => {
        renderHook(() => useStudioThread('project', 'agent', 'thread'));
        fail('UnexpectedServerError');
        expect(storedThread()).toEqual({
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

describe('useCompileFollowUp', () => {
    const render = (isBusy: boolean) =>
        renderHook(
            (props: { isBusy: boolean }) =>
                useCompileFollowUp({
                    projectUuid: 'project',
                    agentUuid: 'agent',
                    threadUuid: 'thread',
                    isBusy: props.isBusy,
                    enableSqlMode: false,
                }),
            { initialProps: { isBusy } },
        );

    beforeEach(() => {
        held.claim.mockReset();
        held.send.mockReset();
        held.compile = {
            status: 'failed',
            requestedByAgent: true,
            compileRequestUuid: 'request-1',
        };
    });

    it('sends the failure to the agent as a hidden prompt once the chat is idle', async () => {
        held.claim.mockResolvedValue({
            agentUuid: 'agent',
            threadUuid: 'thread',
            prompt: 'Fix it',
        });
        const { rerender } = render(true);
        expect(held.claim).not.toHaveBeenCalled();
        rerender({ isBusy: false });
        await waitFor(() =>
            expect(held.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    prompt: 'Fix it',
                    hidden: true,
                    autoApproveSql: false,
                }),
            ),
        );
        expect(held.claim).toHaveBeenCalledWith({
            compileRequestUuid: 'request-1',
            threadUuid: 'thread',
        });
        rerender({ isBusy: true });
        rerender({ isBusy: false });
        expect(held.claim).toHaveBeenCalledTimes(1);
    });

    it('asks again after a refusal once the chat is next idle', async () => {
        held.claim.mockResolvedValue(null);
        const { rerender } = render(false);
        await waitFor(() => expect(held.claim).toHaveBeenCalledTimes(1));
        rerender({ isBusy: true });
        rerender({ isBusy: false });
        await waitFor(() => expect(held.claim).toHaveBeenCalledTimes(2));
        expect(held.send).not.toHaveBeenCalled();
    });

    it("leaves a person's own compile alone", () => {
        held.compile = {
            status: 'failed',
            requestedByAgent: false,
            compileRequestUuid: 'request-1',
        };
        render(false);
        expect(held.claim).not.toHaveBeenCalled();
    });
});
