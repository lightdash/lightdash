import {
    type AiAgentSummary,
    type AiPromptContextInput,
    type AiRouterRouteResponseResult,
} from '@lightdash/common';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    LAUNCHER_AUTO_AGENT,
    type LauncherSelectedAgent,
} from '../aiCopilot/components/Launcher/launcherAgentSelection';
import { useBubbleSend } from './useBubbleSend';

const mocks = vi.hoisted(() => ({
    selectedAgent: null as unknown,
    agents: [] as unknown[],
    imagesEnabled: true,
    createThread: vi.fn(),
    routePrompt: vi.fn(),
    commitDecision: vi.fn(),
    uploadCaptureImages: vi.fn(),
    mutationOptions: null as unknown,
}));

vi.mock('../aiCopilot/components/Launcher/useDefaultAiAgent', () => ({
    useDefaultAiAgent: () => ({
        selectedAgent: mocks.selectedAgent,
        agents: mocks.agents,
    }),
}));
vi.mock('../aiCopilot/hooks/useProjectAiAgents', () => ({
    useCreateAgentThreadMutation: (_projectUuid: string, options: unknown) => {
        mocks.mutationOptions = options;
        return { mutateAsync: mocks.createThread, isLoading: false };
    },
}));
vi.mock('../aiCopilot/hooks/useAiRouter', () => ({
    useAiRouterRoute: () => ({ mutateAsync: mocks.routePrompt }),
    useAiRouterCommit: () => ({ mutate: mocks.commitDecision }),
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: mocks.imagesEnabled } }),
}));
vi.mock('../../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => vi.fn(),
}));
vi.mock('../dashboardCapture/uploadCaptureImages', () => ({
    uploadCaptureImages: mocks.uploadCaptureImages,
}));

const agent = (uuid: string) =>
    ({ uuid, name: `Agent ${uuid}`, imageUrl: null }) as AiAgentSummary;
const agentA = agent('agent-a');
const agentB = agent('agent-b');

const select = (selected: LauncherSelectedAgent) => {
    mocks.selectedAgent = selected;
    mocks.agents = [agentA, agentB];
};

const routed = (
    nextAction: AiRouterRouteResponseResult['nextAction'],
): AiRouterRouteResponseResult =>
    ({
        nextAction,
        decision: {
            decisionUuid: 'decision-1',
            suggestedAgentUuid: 'agent-b',
            candidates: [
                { agentUuid: 'agent-a', name: 'Agent A', description: null },
                { agentUuid: 'agent-b', name: 'Agent B', description: null },
            ],
        },
    }) as AiRouterRouteResponseResult;

const image = new File(['x'], 'capture-0.jpg', { type: 'image/jpeg' });
const context: AiPromptContextInput = [
    { type: 'dashboard', dashboardUuid: 'dash-1' },
];
const input = () => ({
    bubbleId: 'bubble-1',
    buildPrompt: (hasImages: boolean) =>
        hasImages ? 'with images' : 'text only',
    images: [image],
    context,
});

describe('useBubbleSend', () => {
    beforeEach(() => {
        mocks.imagesEnabled = true;
        mocks.createThread.mockReset();
        mocks.createThread.mockImplementation(
            async ({ agentUuid }: { agentUuid: string }) => ({
                uuid: 'thread-1',
                agentUuid,
            }),
        );
        mocks.routePrompt.mockReset();
        mocks.commitDecision.mockReset();
        mocks.uploadCaptureImages.mockReset();
        mocks.uploadCaptureImages.mockResolvedValue(['file-1']);
        select(agentA);
    });

    it('a chosen agent gets the thread with images attached', async () => {
        const { result } = renderHook(() => useBubbleSend('project-1'));
        let sent: unknown;
        await act(async () => {
            sent = await result.current.send(input());
        });
        expect(sent).toEqual({ threadId: 'thread-1', agentUuid: 'agent-a' });
        expect(mocks.routePrompt).not.toHaveBeenCalled();
        expect(mocks.uploadCaptureImages).toHaveBeenCalledWith(
            expect.anything(),
            [image],
        );
        expect(mocks.createThread).toHaveBeenCalledTimes(1);
        expect(mocks.createThread).toHaveBeenCalledWith(
            expect.objectContaining({
                agentUuid: 'agent-a',
                prompt: 'with images',
                context: [
                    ...context,
                    { type: 'thread_image', fileUuid: 'file-1' },
                ],
            }),
        );
        expect(mocks.mutationOptions).toMatchObject({ skipNavigation: true });
        expect(result.current.picker).toBeNull();
    });

    it('on Auto, images upload only after an agent is picked', async () => {
        select(LAUNCHER_AUTO_AGENT);
        mocks.routePrompt.mockResolvedValue(routed('show_picker'));
        const { result } = renderHook(() => useBubbleSend('project-1'));
        let sent: unknown = null;
        act(() => {
            void result.current.send(input()).then((value) => {
                sent = value;
            });
        });
        await waitFor(() => expect(result.current.picker).not.toBeNull());
        expect(mocks.routePrompt).toHaveBeenCalledWith(
            expect.objectContaining({ prompt: 'text only', context }),
        );
        expect(result.current.picker?.bubbleId).toBe('bubble-1');
        expect(
            result.current.picker?.candidates.map((c) => c.agentUuid),
        ).toEqual(['agent-b', 'agent-a']);
        expect(mocks.uploadCaptureImages).not.toHaveBeenCalled();
        expect(mocks.createThread).not.toHaveBeenCalled();

        await act(async () => {
            result.current.picker?.onPick('agent-a');
        });
        await waitFor(() =>
            expect(sent).toEqual({
                threadId: 'thread-1',
                agentUuid: 'agent-a',
            }),
        );
        expect(mocks.uploadCaptureImages).toHaveBeenCalledTimes(1);
        expect(mocks.createThread).toHaveBeenCalledWith(
            expect.objectContaining({
                agentUuid: 'agent-a',
                prompt: 'with images',
                context: [
                    ...context,
                    { type: 'thread_image', fileUuid: 'file-1' },
                ],
            }),
        );
        expect(mocks.commitDecision).toHaveBeenCalledWith({
            decisionUuid: 'decision-1',
            chosenAgentUuid: 'agent-a',
            threadUuid: 'thread-1',
        });
        expect(result.current.picker).toBeNull();
    });

    it('on Auto, a confident route creates the thread without a picker', async () => {
        select(LAUNCHER_AUTO_AGENT);
        mocks.routePrompt.mockResolvedValue(routed('create_thread'));
        const { result } = renderHook(() => useBubbleSend('project-1'));
        let sent: unknown;
        await act(async () => {
            sent = await result.current.send(input());
        });
        expect(sent).toEqual({ threadId: 'thread-1', agentUuid: 'agent-b' });
        expect(mocks.uploadCaptureImages).toHaveBeenCalledTimes(1);
        expect(result.current.picker).toBeNull();
    });

    it('cancelling the picker creates nothing and uploads nothing', async () => {
        select(LAUNCHER_AUTO_AGENT);
        mocks.routePrompt.mockResolvedValue(routed('show_picker'));
        const { result } = renderHook(() => useBubbleSend('project-1'));
        let sent: unknown = null;
        act(() => {
            void result.current.send(input()).then((value) => {
                sent = value;
            });
        });
        await waitFor(() => expect(result.current.picker).not.toBeNull());
        const stale = result.current.picker;
        await act(async () => {
            result.current.picker?.cancel();
        });
        await waitFor(() => expect(sent).toBe('cancelled'));
        expect(result.current.picker).toBeNull();
        // A click that lands after the cancel does nothing.
        await act(async () => {
            stale?.onPick('agent-a');
        });
        expect(mocks.uploadCaptureImages).not.toHaveBeenCalled();
        expect(mocks.createThread).not.toHaveBeenCalled();
        expect(mocks.commitDecision).not.toHaveBeenCalled();
    });

    it('without the ai-thread-images flag, text only', async () => {
        mocks.imagesEnabled = false;
        const { result } = renderHook(() => useBubbleSend('project-1'));
        await act(async () => {
            await result.current.send(input());
        });
        expect(mocks.uploadCaptureImages).not.toHaveBeenCalled();
        expect(mocks.createThread).toHaveBeenCalledWith(
            expect.objectContaining({ prompt: 'text only', context }),
        );
    });

    it('a failed thread after a pick rejects the send', async () => {
        select(LAUNCHER_AUTO_AGENT);
        mocks.routePrompt.mockResolvedValue(routed('show_picker'));
        mocks.createThread.mockRejectedValue(new Error('offline'));
        const { result } = renderHook(() => useBubbleSend('project-1'));
        let failure: unknown = null;
        act(() => {
            void result.current.send(input()).catch((error: unknown) => {
                failure = error;
            });
        });
        await waitFor(() => expect(result.current.picker).not.toBeNull());
        await act(async () => {
            result.current.picker?.onPick('agent-a');
        });
        await waitFor(() => expect(failure).toBeInstanceOf(Error));
        expect(mocks.commitDecision).not.toHaveBeenCalled();
        expect(result.current.picker).toBeNull();
    });

    it('with no agent to send to, the send fails', async () => {
        mocks.selectedAgent = null;
        mocks.agents = [];
        const { result } = renderHook(() => useBubbleSend('project-1'));
        await expect(result.current.send(input())).rejects.toThrow();
        expect(mocks.createThread).not.toHaveBeenCalled();
    });
});
