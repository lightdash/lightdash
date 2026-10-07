import {
    AiAccessRefusalAction,
    AiAccessRefusalReason,
    type AiAccessRefusal,
    type AiModelOption,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { store } from '../../store';
import { openPanel, resetActivePanel } from '../../store/aiAgentLauncherSlice';
import {
    AiAgentsLauncherModalHost,
    AiAgentsLauncherPortal,
} from '../Launcher/AiAgentsLauncherPortal';
import { AgentChatInput } from './AgentChatInput';

const access = vi.hoisted(() => ({
    refusal: null as AiAccessRefusal | null,
    isLoading: false,
    isError: false,
}));

vi.mock('../../../../../features/aiAccess/api', () => ({
    useMyAiAccess: () => ({
        isAccessRequired: true,
        data: { refusal: access.refusal },
        isLoading: access.isLoading,
        isFetching: false,
        isError: access.isError,
        isAccessRequired: true,
        refetch: vi.fn(),
    }),
}));

vi.mock('../../../../../hooks/useSnowflake', () => ({
    useSnowflakeAiLoginPopup: () => ({
        mutate: vi.fn(),
        isLoading: false,
        error: null,
    }),
}));

vi.mock('../../hooks/useAgentSuggestions', () => ({
    useAgentSuggestions: () => ({
        data: {
            chips: [
                {
                    kind: 'prompt',
                    label: 'Show revenue',
                    prompt: 'Show revenue',
                    tool: 'query',
                },
            ],
        },
        isError: false,
    }),
}));

vi.mock('../../hooks/useDeepResearch', () => ({
    useHasActiveDeepResearchRun: vi.fn(() => false),
}));

vi.mock('../../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(() => ({ data: { enabled: false } })),
}));

const models: AiModelOption[] = ['First', 'Second'].map((name) => ({
    name,
    modelId: name,
    displayName: name,
    description: name,
    provider: 'openai',
    default: name === 'First',
    supportsReasoning: false,
    deprecated: false,
}));

const renderInput = (withModels = false) => {
    const onSubmit = vi.fn();
    const result = renderWithProviders(
        <Provider store={store}>
            <MemoryRouter>
                <AgentChatInput
                    onSubmit={onSubmit}
                    projectUuid="project-1"
                    agentUuid="agent-1"
                    defaultValue="Why did enterprise retention fall?"
                    showSuggestions={withModels}
                    models={withModels ? models : undefined}
                    onModelChange={withModels ? vi.fn() : undefined}
                />
            </MemoryRouter>
        </Provider>,
    );
    return {
        ...result,
        onSubmit,
        get element() {
            return screen.getByRole('textbox');
        },
    };
};

beforeAll(() => {
    Range.prototype.getClientRects = () => document.body.getClientRects();
    Range.prototype.getBoundingClientRect = () => new DOMRect();
});

describe('AgentChatInput keyboard handling', () => {
    beforeEach(() => {
        store.dispatch(resetActivePanel());
        access.isLoading = false;
        access.isError = false;
        access.refusal = null;
    });

    it('sends the message on Enter', () => {
        const { onSubmit, element } = renderInput();

        fireEvent.keyDown(element, { key: 'Enter' });

        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Why did enterprise retention fall?',
            }),
        );
    });

    it('hides the composer until the access refusal clears', () => {
        access.refusal = {
            code: 'ai_access_refused',
            reason: AiAccessRefusalReason.NEEDS_SIGN_IN,
            action: AiAccessRefusalAction.SIGN_IN,
            message: 'Sign in to run agent queries.',
            settingsUrl: null,
            connectUrl: null,
        };
        const { onSubmit, rerender } = renderInput();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Send message' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Connect agent' }),
        ).toBeEnabled();
        expect(onSubmit).not.toHaveBeenCalled();

        access.refusal = null;
        rerender(
            <Provider store={store}>
                <MemoryRouter>
                    <AgentChatInput
                        onSubmit={onSubmit}
                        projectUuid="project-1"
                        agentUuid="agent-1"
                        defaultValue="Why did enterprise retention fall?"
                        showSuggestions={false}
                    />
                </MemoryRouter>
            </Provider>,
        );
        expect(
            screen.queryByRole('button', {
                name: 'Connect agent',
            }),
        ).not.toBeInTheDocument();
        expect(screen.getByRole('textbox')).toHaveAttribute(
            'contenteditable',
            'true',
        );
        expect(
            screen.getByRole('button', { name: 'Send message' }),
        ).toBeEnabled();
    });

    it('hides the model picker and suggestion chips when sign-in is required', () => {
        access.refusal = {
            code: 'ai_access_refused',
            reason: AiAccessRefusalReason.NEEDS_SIGN_IN,
            action: AiAccessRefusalAction.SIGN_IN,
            message: 'Sign in to run agent queries.',
            settingsUrl: null,
            connectUrl: null,
        };
        renderInput(true);
        expect(
            screen.queryByRole('button', { name: 'Select model' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', {
                name: 'Show revenue',
                hidden: true,
            }),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it.each([false, true])(
        'hides the composer, model picker and suggestions when the access check fails (models: %s)',
        (withModels) => {
            access.isError = true;
            const { onSubmit } = renderInput(withModels);
            expect(
                screen.getByText(/We could not check your agent connection/),
            ).toBeVisible();
            expect(
                screen.getByRole('button', { name: 'Try again' }),
            ).toBeEnabled();
            expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Send message' }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Select model' }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', {
                    name: 'Show revenue',
                    hidden: true,
                }),
            ).not.toBeInTheDocument();
            expect(onSubmit).not.toHaveBeenCalled();
        },
    );

    it('reserves space without a composer or callout while access loads', () => {
        access.isLoading = true;
        renderInput(true);
        expect(screen.getByTestId('ai-access-placeholder')).toBeInTheDocument();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Connect agent' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', {
                name: 'Show revenue',
                hidden: true,
            }),
        ).not.toBeInTheDocument();
    });

    it('does not send on Shift+Enter', () => {
        const { onSubmit, element } = renderInput();

        fireEvent.keyDown(element, { key: 'Enter', shiftKey: true });

        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('lets a modal-hosted launcher consume Escape before its editor modal', () => {
        const onSubmit = vi.fn();
        store.dispatch(openPanel({ threadId: null, agentUuid: 'agent-uuid' }));
        renderWithProviders(
            <Provider store={store}>
                <MemoryRouter>
                    <div role="dialog">
                        <AiAgentsLauncherModalHost />
                    </div>
                    <AiAgentsLauncherPortal>
                        <AgentChatInput
                            onSubmit={onSubmit}
                            projectUuid="project-1"
                            agentUuid="agent-1"
                            defaultValue="Explain this chart"
                            showSuggestions={false}
                        />
                    </AiAgentsLauncherPortal>
                </MemoryRouter>
            </Provider>,
        );

        fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });

        expect(store.getState().aiAgentLauncher.mode).toBe('collapsed');
        expect(onSubmit).not.toHaveBeenCalled();
    });
});
