import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    findRetryableDeepResearchRun,
    registerDeepResearchRun,
    replaceDeepResearchRun,
    restoreDeepResearchComposerPrompt,
    subscribeToDeepResearchComposerPrompt,
} from './deepResearchRegistry';
import { type DeepResearchRunRegistration } from './types';

const failedRegistration = (
    overrides: Partial<DeepResearchRunRegistration> = {},
): DeepResearchRunRegistration => ({
    runUuid: 'starting-1',
    projectUuid: 'project-1',
    agentUuid: 'agent-1',
    threadUuid: 'thread-1',
    promptUuid: 'prompt-1',
    mcpServerUuids: ['mcp-1'],
    userUuid: 'user-1',
    question: 'Why did retention fall?',
    depth: 'standard',
    createdAt: '2026-07-24T09:00:00.000Z',
    state: 'start_failed',
    errorMessage: 'Could not enqueue run',
    ...overrides,
});

describe('deepResearchRegistry', () => {
    afterEach(() => {
        window.localStorage.clear();
        vi.restoreAllMocks();
    });

    it('returns the latest failed registration for the same prompt context', () => {
        registerDeepResearchRun(
            failedRegistration({
                runUuid: 'starting-old',
                promptUuid: 'prompt-old',
            }),
        );
        registerDeepResearchRun(
            failedRegistration({
                runUuid: 'starting-new',
                promptUuid: 'prompt-new',
                createdAt: '2026-07-24T09:01:00.000Z',
            }),
        );
        registerDeepResearchRun(
            failedRegistration({
                runUuid: 'different-question',
                promptUuid: 'prompt-different',
                question: 'What changed?',
            }),
        );

        expect(
            findRetryableDeepResearchRun({
                projectUuid: 'project-1',
                agentUuid: 'agent-1',
                threadUuid: 'thread-1',
                userUuid: 'user-1',
                question: 'Why did retention fall?',
            }),
        ).toMatchObject({
            runUuid: 'starting-new',
            promptUuid: 'prompt-new',
        });
    });

    it('replaces failed retries for a prompt with the started run', () => {
        registerDeepResearchRun(
            failedRegistration({ runUuid: 'starting-old' }),
        );
        registerDeepResearchRun(
            failedRegistration({ runUuid: 'starting-current' }),
        );

        replaceDeepResearchRun(
            'starting-current',
            failedRegistration({
                runUuid: 'run-1',
                state: 'started',
                errorMessage: undefined,
            }),
        );

        expect(
            JSON.parse(
                window.localStorage.getItem(
                    'lightdash.deep-research-runs.v1',
                ) ?? '[]',
            ),
        ).toEqual([
            expect.objectContaining({
                runUuid: 'run-1',
                promptUuid: 'prompt-1',
                state: 'started',
            }),
        ]);
    });

    it('restores the failed prompt in the matching thread composer', () => {
        const listener = vi.fn();
        const unsubscribe = subscribeToDeepResearchComposerPrompt(listener);

        restoreDeepResearchComposerPrompt(
            'thread-1',
            'Why did retention fall?',
        );

        expect(listener).toHaveBeenCalledWith({
            threadUuid: 'thread-1',
            prompt: 'Why did retention fall?',
        });
        unsubscribe();
    });
});
