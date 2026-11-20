import {
    type AiAgentSummary,
    type AiPromptContext,
    type AiPromptContextInput,
    type AiRouterRouteResponseResult,
} from '@lightdash/common';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    useAiAgentRouterFlow,
    type AiAgentRouterErrorArgs,
    type CreateThreadForAgent,
} from './useAiAgentRouterFlow';

const { commitDecision, routePrompt } = vi.hoisted(() => ({
    commitDecision: vi.fn(),
    routePrompt: vi.fn(),
}));

vi.mock('./useAiRouter', () => ({
    useAiRouterCommit: () => ({ mutate: commitDecision }),
    useAiRouterRoute: () => ({ mutateAsync: routePrompt }),
}));

const routeResult = (
    nextAction: AiRouterRouteResponseResult['nextAction'],
): AiRouterRouteResponseResult => ({
    decision: {
        candidates: [],
        confidence: nextAction === 'create_thread' ? 'high' : 'low',
        decisionUuid: 'decision-1',
        reasoning: 'Best match',
        suggestedAgentUuid: 'agent-1',
    },
    nextAction,
});

const imageContext: AiPromptContextInput = [
    { type: 'thread_image', fileUuid: 'image-1' },
];
const imageSnapshot: AiPromptContext = [
    {
        type: 'thread_image',
        fileUuid: 'image-1',
        fileName: 'chart.png',
        sizeBytes: 1024,
        mediaType: 'image/png',
        width: 800,
        height: 600,
    },
];
const imageMessage = {
    context: imageContext,
    message: 'Recreate this chart',
    optimisticContext: imageSnapshot,
    toolHints: [],
};

const fallbackAgent: AiAgentSummary = {
    uuid: 'agent-fallback',
    kind: 'user',
    name: 'Fallback agent',
    description: null,
    integrations: [],
    tags: null,
    projectUuid: 'project-1',
    organizationUuid: 'org-1',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    instruction: null,
    imageUrl: null,
    imageUrlSource: null,
    groupAccess: [],
    userAccess: [],
    userAccessDetails: [],
    spaceAccess: [],
    enableDataAccess: true,
    enableSelfImprovement: false,
    enableContentTools: true,
    enableUserContext: false,
    enableSqlMode: false,
    enableSqlAutoApproval: false,
    enableComposerQueries: false,
    adminOnly: false,
    modelConfig: null,
    providerCredentialUuid: null,
    version: 1,
    threadRetentionHours: null,
};

const setup = ({
    agents = [],
    onRouteError,
}: {
    agents?: AiAgentSummary[];
    onRouteError?: (args: AiAgentRouterErrorArgs) => Promise<unknown> | void;
} = {}) => {
    const createThreadForAgent = vi
        .fn<CreateThreadForAgent>()
        .mockResolvedValue({ uuid: 'thread-1' });
    const rendered = renderHook(() =>
        useAiAgentRouterFlow({
            agents,
            createThreadForAgent,
            onRouteError,
            projectUuid: 'project-1',
        }),
    );
    return { ...rendered, createThreadForAgent };
};

/** Submits and reports how the submitter's promise ended, without awaiting it. */
const submit = (
    result: ReturnType<typeof setup>['result'],
    args: Parameters<
        ReturnType<typeof useAiAgentRouterFlow>['submitUntilCreated']
    >[0] = imageMessage,
) => {
    const outcome = { settled: 'pending' };
    act(() => {
        void result.current.submitUntilCreated(args).then(
            () => {
                outcome.settled = 'resolved';
            },
            () => {
                outcome.settled = 'rejected';
            },
        );
    });
    return outcome;
};

describe('useAiAgentRouterFlow', () => {
    beforeEach(() => {
        commitDecision.mockReset();
        routePrompt.mockReset();
    });

    it('uses the submitted thread operation for the routed agent', async () => {
        routePrompt.mockResolvedValue(routeResult('create_thread'));
        const submittedCreateThread = vi
            .fn<CreateThreadForAgent>()
            .mockResolvedValue({ uuid: 'thread-1' });
        const { result, createThreadForAgent } = setup();

        await act(() =>
            result.current.handleSubmit({
                createThreadForAgent: submittedCreateThread,
                message: 'Investigate revenue',
                toolHints: [],
            }),
        );

        expect(submittedCreateThread).toHaveBeenCalledWith({
            agentUuid: 'agent-1',
            context: undefined,
            message: 'Investigate revenue',
            optimisticContext: undefined,
            toolHints: [],
        });
        expect(createThreadForAgent).not.toHaveBeenCalled();
    });

    it('tells the router what content the question is pinned to', async () => {
        routePrompt.mockResolvedValue(routeResult('create_thread'));
        const context = [
            { type: 'dashboard' as const, dashboardUuid: 'dash-1' },
        ];
        const { result } = setup();

        await act(() =>
            result.current.handleSubmit({
                context,
                message: 'What is the conversion rate here?',
                toolHints: [],
            }),
        );

        expect(routePrompt).toHaveBeenCalledWith({
            prompt: 'What is the conversion rate here?',
            projectUuid: 'project-1',
            context,
        });
    });

    it('retains the submitted operation while the user picks an agent', async () => {
        routePrompt.mockResolvedValue(routeResult('show_picker'));
        const submittedCreateThread = vi
            .fn<CreateThreadForAgent>()
            .mockResolvedValue({ uuid: 'thread-2' });
        const { result } = setup();

        submit(result, {
            createThreadForAgent: submittedCreateThread,
            message: 'Investigate churn',
            toolHints: [],
        });
        await waitFor(() => expect(result.current.isPickingAgent).toBe(true));
        act(() => result.current.confirmPick('agent-2'));

        await waitFor(() =>
            expect(submittedCreateThread).toHaveBeenCalledWith({
                agentUuid: 'agent-2',
                context: undefined,
                message: 'Investigate churn',
                optimisticContext: undefined,
                toolHints: [],
            }),
        );
    });

    it('answers a submitter that does not wait for the pick as soon as the picker shows', async () => {
        routePrompt.mockResolvedValue(routeResult('show_picker'));
        const { result, createThreadForAgent, unmount } = setup();

        await act(() =>
            result.current.handleSubmit({
                message: 'Investigate churn',
                toolHints: [],
            }),
        );

        expect(result.current.isPickingAgent).toBe(true);
        expect(createThreadForAgent).not.toHaveBeenCalled();
        // Leaving must not surface as an unhandled rejection for this submitter.
        unmount();
    });

    describe('images attached while the router picks the agent', () => {
        it('reach the conversation once when the router picks directly', async () => {
            routePrompt.mockResolvedValue(routeResult('create_thread'));
            const { result, createThreadForAgent } = setup();

            const outcome = submit(result);

            await waitFor(() => expect(outcome.settled).toBe('resolved'));
            expect(createThreadForAgent).toHaveBeenCalledExactlyOnceWith({
                agentUuid: 'agent-1',
                context: imageContext,
                message: 'Recreate this chart',
                optimisticContext: imageSnapshot,
                toolHints: [],
            });
        });

        it.each([
            ['the suggested agent', 'agent-1'],
            ['a different agent', 'agent-2'],
        ])(
            'stay held at the picker and reach the conversation once when the user picks %s',
            async (_label, pickedAgentUuid) => {
                routePrompt.mockResolvedValue(routeResult('show_picker'));
                const { result, createThreadForAgent } = setup();

                const outcome = submit(result);
                await waitFor(() =>
                    expect(result.current.isPickingAgent).toBe(true),
                );

                // Nothing is created, and the submitter still owns the draft.
                expect(createThreadForAgent).not.toHaveBeenCalled();
                expect(outcome.settled).toBe('pending');
                expect(result.current.phase).toMatchObject({
                    kind: 'picker',
                    context: imageContext,
                    optimisticContext: imageSnapshot,
                });

                act(() => result.current.confirmPick(pickedAgentUuid));

                await waitFor(() => expect(outcome.settled).toBe('resolved'));
                expect(createThreadForAgent).toHaveBeenCalledExactlyOnceWith({
                    agentUuid: pickedAgentUuid,
                    context: imageContext,
                    message: 'Recreate this chart',
                    optimisticContext: imageSnapshot,
                    toolHints: [],
                });
                expect(commitDecision).toHaveBeenCalledExactlyOnceWith({
                    decisionUuid: 'decision-1',
                    chosenAgentUuid: pickedAgentUuid,
                    threadUuid: 'thread-1',
                });
            },
        );

        it('reach the fallback agent once when routing fails', async () => {
            routePrompt.mockRejectedValue(new Error('Router unavailable'));
            const fallbackCreate = vi
                .fn<CreateThreadForAgent>()
                .mockResolvedValue({ uuid: 'thread-1' });
            const { result, createThreadForAgent } = setup({
                agents: [fallbackAgent],
                onRouteError: ({ fallbackAgent: agent, ...args }) =>
                    fallbackCreate({
                        agentUuid: agent?.uuid ?? 'none',
                        context: args.context,
                        message: args.message,
                        optimisticContext: args.optimisticContext,
                        toolHints: args.toolHints,
                    }),
            });

            const outcome = submit(result);

            await waitFor(() => expect(outcome.settled).toBe('resolved'));
            expect(fallbackCreate).toHaveBeenCalledExactlyOnceWith({
                agentUuid: 'agent-fallback',
                context: imageContext,
                message: 'Recreate this chart',
                optimisticContext: imageSnapshot,
                toolHints: [],
            });
            expect(createThreadForAgent).not.toHaveBeenCalled();
            expect(result.current.isLocked).toBe(false);
        });

        it('are handed back when the fallback conversation cannot be created', async () => {
            routePrompt.mockRejectedValue(new Error('Router unavailable'));
            const { result } = setup({
                agents: [fallbackAgent],
                onRouteError: () =>
                    Promise.reject(new Error('Creation failed')),
            });

            const outcome = submit(result);

            await waitFor(() => expect(outcome.settled).toBe('rejected'));
        });

        it('are handed back when the routed conversation cannot be created', async () => {
            routePrompt.mockResolvedValue(routeResult('create_thread'));
            const { result, createThreadForAgent } = setup();
            createThreadForAgent.mockRejectedValue(
                new Error('Creation failed'),
            );

            const outcome = submit(result);

            await waitFor(() => expect(outcome.settled).toBe('rejected'));
            expect(result.current.isLocked).toBe(false);
            expect(commitDecision).not.toHaveBeenCalled();
        });

        it('are handed back, and the composer unlocked, when a held image can no longer be claimed', async () => {
            routePrompt.mockResolvedValue(routeResult('show_picker'));
            const { result, createThreadForAgent } = setup();
            createThreadForAgent.mockRejectedValue(
                new Error('One or more attached files are unavailable.'),
            );

            const outcome = submit(result);
            await waitFor(() =>
                expect(result.current.isPickingAgent).toBe(true),
            );
            act(() => result.current.confirmPick('agent-2'));

            await waitFor(() => expect(outcome.settled).toBe('rejected'));
            expect(createThreadForAgent).toHaveBeenCalledOnce();
            expect(result.current.isLocked).toBe(false);
            expect(commitDecision).not.toHaveBeenCalled();
        });

        it('are released without a conversation when the user leaves the picker', async () => {
            routePrompt.mockResolvedValue(routeResult('show_picker'));
            const { result, createThreadForAgent, unmount } = setup();

            const outcome = submit(result);
            await waitFor(() =>
                expect(result.current.isPickingAgent).toBe(true),
            );
            unmount();

            await waitFor(() => expect(outcome.settled).toBe('rejected'));
            expect(createThreadForAgent).not.toHaveBeenCalled();
            expect(commitDecision).not.toHaveBeenCalled();
        });

        it('are not released by leaving once the pick is being created', async () => {
            routePrompt.mockResolvedValue(routeResult('show_picker'));
            const { result, createThreadForAgent, unmount } = setup();
            let finishCreation = (_thread: { uuid: string }) => {};
            createThreadForAgent.mockReturnValue(
                new Promise((resolve) => {
                    finishCreation = resolve;
                }),
            );

            const outcome = submit(result);
            await waitFor(() =>
                expect(result.current.isPickingAgent).toBe(true),
            );
            act(() => result.current.confirmPick('agent-2'));
            unmount();
            await Promise.resolve();
            expect(outcome.settled).toBe('pending');

            finishCreation({ uuid: 'thread-1' });
            await waitFor(() => expect(outcome.settled).toBe('resolved'));
        });
    });
});
