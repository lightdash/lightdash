import type {
    AiAgentMessage,
    AiAgentModelConfig,
    AiModelOption,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getThreadModel } from './useThreadModel';

const option = (overrides: Partial<AiModelOption>): AiModelOption => ({
    name: 'claude-sonnet-5-5',
    modelId: 'claude-sonnet-5-5',
    displayName: 'Claude Sonnet 5.5',
    description: '',
    provider: 'anthropic',
    default: false,
    supportsReasoning: true,
    deprecated: false,
    supersededBy: null,
    ...overrides,
});

const sonnet55 = option({});
const sonnet5 = option({
    name: 'claude-sonnet-5',
    modelId: 'claude-sonnet-5',
    displayName: 'Claude Sonnet 5',
    deprecated: true,
    supersededBy: 'claude-sonnet-5-5',
});
const opus55 = option({
    name: 'claude-opus-5-5',
    modelId: 'claude-opus-5-5',
    displayName: 'Claude Opus 5.5',
});

const assistantAnsweredBy = (modelConfig: AiAgentModelConfig | null) =>
    ({ role: 'assistant', modelConfig }) as AiAgentMessage;
const userMessage = { role: 'user' } as AiAgentMessage;

describe('getThreadModel', () => {
    it('shows the model that answered the first turn, not a later one', () => {
        const messages = [
            userMessage,
            assistantAnsweredBy({
                modelProvider: 'anthropic',
                modelName: 'claude-sonnet-5-5',
            }),
            userMessage,
            assistantAnsweredBy({
                modelProvider: 'anthropic',
                modelName: 'claude-opus-5-5',
            }),
        ];

        expect(getThreadModel(messages, [sonnet55, opus55])).toEqual({
            name: 'Claude Sonnet 5.5',
            deprecationWarning: null,
        });
    });

    it('warns and names the replacement when the thread model is deprecated', () => {
        const messages = [
            userMessage,
            assistantAnsweredBy({
                modelProvider: 'anthropic',
                modelName: 'claude-sonnet-5',
            }),
        ];

        expect(getThreadModel(messages, [sonnet5, sonnet55])).toEqual({
            name: 'Claude Sonnet 5',
            deprecationWarning:
                'Claude Sonnet 5 is deprecated. Start a new thread to use Claude Sonnet 5.5.',
        });
    });

    it('shows no model before the thread has an answer', () => {
        expect(getThreadModel([userMessage], [sonnet55])).toBeNull();
    });
});
