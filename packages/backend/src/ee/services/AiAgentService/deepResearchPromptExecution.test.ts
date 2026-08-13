import { describe, expect, it } from 'vitest';
import { assertDeepResearchPromptExecution } from './AiAgentService';

describe('assertDeepResearchPromptExecution', () => {
    it('rejects a standard response for a Deep Research prompt', () => {
        expect(() =>
            assertDeepResearchPromptExecution({
                promptRunUuid: 'run-1',
                expectedRunUuid: null,
            }),
        ).toThrow(/belongs to a Deep Research run/);
    });

    it('allows the matching Deep Research execution', () => {
        expect(() =>
            assertDeepResearchPromptExecution({
                promptRunUuid: 'run-1',
                expectedRunUuid: 'run-1',
            }),
        ).not.toThrow();
    });

    it('rejects a Deep Research execution without a matching run', () => {
        expect(() =>
            assertDeepResearchPromptExecution({
                promptRunUuid: undefined,
                expectedRunUuid: 'run-1',
            }),
        ).toThrow(/does not match the requested Deep Research run/);
    });
});
