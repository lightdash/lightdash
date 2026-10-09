import type { AiModelOption } from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import {
    useAiAgentModelSelection,
    useDefaultAiAgentModel,
} from './useAiAgentModelSelection';

const model = (
    name: string,
    displayName: string,
    options: Partial<AiModelOption> = {},
): AiModelOption => ({
    name,
    modelId: name,
    displayName,
    description: '',
    provider: 'anthropic',
    default: false,
    supportsReasoning: true,
    deprecated: false,
    supersededBy: null,
    ...options,
});

const sonnet55 = model('claude-sonnet-5-5', 'Claude Sonnet 5.5', {
    default: true,
});
const sonnet5 = model('claude-sonnet-5', 'Claude Sonnet 5', {
    deprecated: true,
    supersededBy: 'claude-sonnet-5-5',
});
const modelOptions = [sonnet55, sonnet5];

vi.mock('./useModelOptions', () => ({
    useModelOptions: () => ({ data: modelOptions }),
}));
vi.mock('./useAiOrganizationSettings', () => ({
    useAiOrganizationSettings: () => ({ data: undefined, isFetched: true }),
}));

describe('useDefaultAiAgentModel', () => {
    it('keeps a retired selection visible and offers its replacement with the same reasoning choice', () => {
        const { result } = renderHook(() =>
            useDefaultAiAgentModel({
                modelOptions,
                modelConfig: {
                    modelName: 'claude-sonnet-5',
                    modelProvider: 'anthropic',
                    reasoning: true,
                },
                fallbackLabel: 'Organization default',
            }),
        );

        expect(result.current.selectedModel).toBe(sonnet5);
        expect(result.current.modelReplacement).toEqual({
            model: sonnet55,
            modelConfig: {
                modelName: 'claude-sonnet-5-5',
                modelProvider: 'anthropic',
                reasoning: true,
            },
        });
        expect(result.current.visibleModelOptions).toEqual(modelOptions);
    });

    it('reports no replacement for a current selection', () => {
        const { result } = renderHook(() =>
            useDefaultAiAgentModel({
                modelOptions,
                modelConfig: {
                    modelName: 'claude-sonnet-5-5',
                    modelProvider: 'anthropic',
                },
                fallbackLabel: 'Organization default',
            }),
        );

        expect(result.current.modelReplacement).toBeNull();
        expect(result.current.visibleModelOptions).toEqual([sonnet55]);
    });

    it('keeps a retired selection without a replacement the org can pick', () => {
        const unreplaced = { ...sonnet5, supersededBy: null };
        const { result } = renderHook(() =>
            useDefaultAiAgentModel({
                modelOptions: [unreplaced],
                modelConfig: {
                    modelName: 'claude-sonnet-5',
                    modelProvider: 'anthropic',
                },
                fallbackLabel: 'Organization default',
            }),
        );

        expect(result.current.selectedModel).toBe(unreplaced);
        expect(result.current.selectedModel?.deprecated).toBe(true);
        expect(result.current.modelReplacement).toBeNull();
    });
});

describe('useAiAgentModelSelection', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('starts a new chat on the replacement when the agent pins a retired model', () => {
        const { result } = renderHook(() =>
            useAiAgentModelSelection({
                projectUuid: 'project',
                agentUuid: 'agent',
                defaultModelConfig: {
                    modelName: 'claude-sonnet-5',
                    modelProvider: 'anthropic',
                    reasoning: true,
                },
                organizationSettingsEnabled: false,
            }),
        );

        expect(result.current.selectedModel).toBe(sonnet55);
        expect(result.current.agentDefault.model).toBe(sonnet55);
        // The server resolves the agent's retired model to its replacement.
        expect(result.current.explicitModelConfig).toBeUndefined();
    });

    it('moves a remembered retired choice to its replacement', () => {
        window.localStorage.setItem(
            'aiAgentsModelSelection:v1:agent',
            JSON.stringify({
                modelKey: 'anthropic:claude-sonnet-5',
                extendedThinking: null,
            }),
        );
        const { result } = renderHook(() =>
            useAiAgentModelSelection({
                projectUuid: 'project',
                agentUuid: 'agent',
                organizationSettingsEnabled: false,
            }),
        );

        expect(result.current.selectedModelKey).toBe(
            'anthropic:claude-sonnet-5-5',
        );
    });
});
