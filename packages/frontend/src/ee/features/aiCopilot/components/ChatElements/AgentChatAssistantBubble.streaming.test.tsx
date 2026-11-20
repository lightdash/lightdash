import { type AiAgentMessageAssistant } from '@lightdash/common';
import { act, screen } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { type AiAgentThreadStreamingState } from '../../store/aiAgentThreadStreamSlice';
import { AssistantBubble } from './AgentChatAssistantBubble';
import type * as RehypeMemoryCitations from './rehypeMemoryCitations';

const stream = vi.hoisted(() => {
    let state: unknown;
    const listeners = new Set<() => void>();
    return {
        parses: 0,
        get: () => state,
        set: (next: unknown) => {
            state = next;
            listeners.forEach((listener) => listener());
        },
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
});

vi.mock('../../streaming/useAiAgentThreadStreamQuery', () => ({
    useAiAgentThreadStreamQuery: () =>
        useSyncExternalStore(stream.subscribe, stream.get),
    useAiAgentThreadMessageStreaming: () => true,
}));
// Runs once per markdown block parse.
vi.mock('./rehypeMemoryCitations', async (importOriginal) => {
    const actual = await importOriginal<typeof RehypeMemoryCitations>();
    return {
        rehypeMemoryCitationIndices: () => {
            const transform = actual.rehypeMemoryCitationIndices();
            return (tree: Parameters<typeof transform>[0]) => {
                stream.parses += 1;
                return transform(tree);
            };
        },
    };
});
vi.mock('../../store/hooks', () => ({
    useAiAgentStoreDispatch: () => vi.fn(),
    useAiAgentStoreSelector: () => null,
}));
vi.mock('../../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: false } }),
}));
vi.mock('../../hooks/useProjectAiAgents', () => ({
    useRetryAiAgentThreadMessageMutation: () => ({ mutate: vi.fn() }),
    useUpdatePromptFeedbackMutation: () => ({ mutate: vi.fn() }),
}));
vi.mock('../../../../../providers/Ability/useAbilityContext', () => ({
    useAbilityContext: () => ({ can: () => true }),
}));
vi.mock('../../../../../providers/App/useApp', () => ({
    default: () => ({
        health: {},
        user: {
            data: { organizationUuid: 'org', ability: { can: () => true } },
        },
    }),
}));
vi.mock('./AgentChatDebugDrawer', () => ({ default: () => null }));
vi.mock('./AiDocumentCards', () => ({ default: () => null }));
vi.mock('./MessageTimingIndicator', () => ({
    MessageTimingIndicator: () => null,
}));
vi.mock('./ToolCalls/WritebackDiffModal', () => ({
    WritebackDiffModal: () => null,
}));

const message = {
    uuid: 'message',
    threadUuid: 'thread',
    role: 'assistant',
    status: 'pending',
    message: '',
    errorMessage: null,
    toolCalls: [],
    toolResults: [],
    artifacts: [],
    reasoning: [],
    createdAt: new Date().toISOString(),
    vizConfigOutput: null,
    filtersOutput: null,
    metricQuery: null,
    humanScore: null,
    user: { uuid: 'user', name: 'User' },
    savedQueryUuid: null,
    interrupted: false,
} as unknown as AiAgentMessageAssistant;

const streamOf = (content: string) =>
    ({
        threadUuid: 'thread',
        messageUuid: 'message',
        projectUuid: 'project',
        agentUuid: 'agent',
        autoApproveSql: false,
        content,
        parts: [{ type: 'text', text: content }],
        connection: { status: 'streaming' },
        wasInterrupted: false,
        toolCalls: [],
        reasoning: [],
        decidedToolCallIds: [],
        stepProgressMessages: [],
        timing: {},
    }) as unknown as AiAgentThreadStreamingState;

describe('streaming an answer', () => {
    it('parses only the block still being written on each frame', async () => {
        const finished = Array.from(
            { length: 10 },
            (_, i) =>
                `Finished paragraph ${i} with [a link](https://x.io/${i}).`,
        ).join('\n\n');
        let text = `${finished}\n\nStill writing`;
        stream.set(streamOf(text));
        renderWithProviders(
            <MemoryRouter>
                <AssistantBubble
                    message={message}
                    hiddenSibling={null}
                    isLastMessage
                    canRetry
                    projectUuid="project"
                    agentUuid="agent"
                />
            </MemoryRouter>,
        );
        expect(await screen.findAllByRole('link')).toHaveLength(10);

        stream.parses = 0;
        const frames = 5;
        for (let frame = 0; frame < frames; frame += 1) {
            text += ' more words';
            const next = streamOf(text);
            // eslint-disable-next-line no-await-in-loop
            await act(async () => stream.set(next));
        }

        expect(stream.parses).toBeLessThanOrEqual(frames);
    });
});
