import { fireEvent, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { store } from '../../store';
import { openPanel, resetActivePanel } from '../../store/aiAgentLauncherSlice';
import {
    AiAgentsLauncherModalHost,
    AiAgentsLauncherPortal,
} from '../Launcher/AiAgentsLauncherPortal';
import { AgentChatInput } from './AgentChatInput';

vi.mock('../../hooks/useDeepResearch', () => ({
    useHasActiveDeepResearchRun: vi.fn(() => false),
}));

vi.mock('../../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(() => ({ data: { enabled: false } })),
}));

const renderInput = () => {
    const onSubmit = vi.fn();
    renderWithProviders(
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
    return { onSubmit, element: screen.getByRole('textbox') };
};

describe('AgentChatInput keyboard handling', () => {
    beforeEach(() => {
        store.dispatch(resetActivePanel());
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
