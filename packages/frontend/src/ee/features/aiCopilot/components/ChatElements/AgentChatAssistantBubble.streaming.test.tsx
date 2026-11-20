import { type AiAgentMessageAssistant } from '@lightdash/common';
import { act, screen, waitFor } from '@testing-library/react';
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
    useAiAgentMessageStream: () =>
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

const message: AiAgentMessageAssistant = {
    role: 'assistant',
    status: 'pending',
    uuid: 'message',
    threadUuid: 'thread',
    message: null,
    errorMessage: null,
    interrupted: false,
    createdAt: new Date().toISOString(),
    humanScore: null,
    toolCalls: [],
    toolResults: [],
    reasoning: [],
    savedQueryUuid: null,
    artifacts: null,
    referencedArtifacts: null,
    modelConfig: null,
    tokenUsage: null,
    responseTiming: null,
    jevDecision: null,
    loadout: null,
};

const streamOf = (content: string): AiAgentThreadStreamingState => ({
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
    timing: { startedAt: 0, firstTokenAt: 0, finishedAt: null },
});

const renderBubble = () =>
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

describe('streaming an answer', () => {
    it('parses only the block still being written on each frame', async () => {
        const finished = Array.from(
            { length: 10 },
            (_, i) =>
                `Finished paragraph ${i} with [a link](https://x.io/${i}).`,
        ).join('\n\n');
        let lastParagraph = 'Still writing';
        stream.set(streamOf(`${finished}\n\n${lastParagraph}`));
        renderBubble();
        expect(await screen.findAllByRole('link')).toHaveLength(10);

        stream.parses = 0;
        const frames = 5;
        for (let frame = 0; frame < frames; frame += 1) {
            lastParagraph += ' more words';
            const next = streamOf(`${finished}\n\n${lastParagraph}`);
            // eslint-disable-next-line no-await-in-loop
            await act(async () => stream.set(next));
        }

        await waitFor(() =>
            expect(document.body).toHaveTextContent(lastParagraph),
        );
        expect(stream.parses).toBeGreaterThan(0);
        expect(stream.parses).toBeLessThanOrEqual(frames);
    });
});

describe('streaming text after a tool call', () => {
    it('mounts the new text fresh so its words fade in', async () => {
        const toolCall = {
            type: 'toolCall' as const,
            toolCallId: 'call',
            toolName: 'findExplores',
            toolArgs: {},
            toolResult: null,
            isPreliminary: false,
        };
        stream.set(streamOf('Looking for the right explore'));
        renderBubble();
        await waitFor(() =>
            expect(document.body).toHaveTextContent(
                'Looking for the right explore',
            ),
        );
        const firstWord = document.querySelector('[data-sd-animate]');
        expect(firstWord).not.toBeNull();

        const answer = 'Revenue grew last quarter';
        await act(async () =>
            stream.set({
                ...streamOf(answer),
                parts: [
                    { type: 'text', text: 'Looking for the right explore' },
                    toolCall,
                    { type: 'text', text: answer },
                ],
            }),
        );

        await waitFor(() => expect(document.body).toHaveTextContent(answer));
        expect(firstWord?.isConnected).toBe(false);
        expect(
            Array.from(document.querySelectorAll('[data-sd-animate]')).map(
                (span) => span.textContent,
            ),
        ).toStrictEqual(answer.split(' '));
    });
});
