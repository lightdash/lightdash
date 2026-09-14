import { fireEvent, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { store } from '../../store';
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
});
