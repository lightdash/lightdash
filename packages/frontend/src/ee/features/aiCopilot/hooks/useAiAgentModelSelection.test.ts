import { type AiModelOption } from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAiAgentModelSelection } from './useAiAgentModelSelection';

const { modelOptionsMock, organizationSettingsMock } = vi.hoisted(() => ({
    modelOptionsMock: vi.fn(),
    organizationSettingsMock: vi.fn(),
}));

vi.mock('./useModelOptions', () => ({
    useModelOptions: modelOptionsMock,
}));

vi.mock('./useAiOrganizationSettings', () => ({
    useAiOrganizationSettings: organizationSettingsMock,
}));

const modelOption = (name: string, isDefault = false): AiModelOption => ({
    name,
    modelId: name,
    displayName: name,
    description: '',
    provider: 'anthropic',
    default: isDefault,
    supportsReasoning: false,
    deprecated: false,
});

const agentModel = modelOption('agent-model');
const organizationModel = modelOption('organization-model');
const systemDefaultModel = modelOption('system-default', true);
const otherModel = modelOption('other-model');
const modelOptions = [
    agentModel,
    organizationModel,
    systemDefaultModel,
    otherModel,
];

const renderSelection = (
    defaultModelConfig: { modelProvider: string; modelName: string } | null,
) =>
    renderHook(() =>
        useAiAgentModelSelection({
            projectUuid: 'project-1',
            agentUuid: 'agent-1',
            defaultModelConfig,
        }),
    );

describe('useAiAgentModelSelection', () => {
    beforeEach(() => {
        window.localStorage.clear();
        modelOptionsMock.mockReturnValue({ data: modelOptions });
        organizationSettingsMock.mockReturnValue({
            data: {
                defaultAiAgentModelConfig: {
                    modelProvider: 'anthropic',
                    modelName: 'organization-model',
                },
            },
            isFetched: true,
        });
    });

    it("shows the agent's model but sends nothing until the user picks", () => {
        const { result } = renderSelection({
            modelProvider: 'anthropic',
            modelName: 'agent-model',
        });

        expect(result.current.selectedModel).toEqual(agentModel);
        expect(result.current.explicitModelConfig).toBeUndefined();
    });

    it('shows the organization default when the agent has no model', () => {
        const { result } = renderSelection(null);

        expect(result.current.selectedModel).toEqual(organizationModel);
        expect(result.current.explicitModelConfig).toBeUndefined();
    });

    it('sends the model once the user picks one', () => {
        const { result } = renderSelection({
            modelProvider: 'anthropic',
            modelName: 'agent-model',
        });

        act(() => {
            result.current.handleSelectedModelKeyChange(
                'anthropic:other-model',
            );
        });

        expect(result.current.explicitModelConfig).toEqual({
            modelProvider: 'anthropic',
            modelName: 'other-model',
            reasoning: undefined,
        });
    });

    it('keeps sending an earlier pick for the same agent', () => {
        const first = renderSelection({
            modelProvider: 'anthropic',
            modelName: 'agent-model',
        });
        act(() => {
            first.result.current.handleSelectedModelKeyChange(
                'anthropic:other-model',
            );
        });
        first.unmount();

        const { result } = renderSelection({
            modelProvider: 'anthropic',
            modelName: 'agent-model',
        });

        expect(result.current.explicitModelConfig?.modelName).toBe(
            'other-model',
        );
    });
});
