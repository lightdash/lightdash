import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { store } from '../../store';
import { AgentChatInput } from './AgentChatInput';

describe('AgentChatInput Deep research mode', () => {
    it('starts inline research instead of submitting a normal Ask message', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn();
        const onStartDeepResearch = vi.fn().mockResolvedValue(undefined);

        renderWithProviders(
            <Provider store={store}>
                <MemoryRouter>
                    <AgentChatInput
                        onSubmit={onSubmit}
                        onStartDeepResearch={onStartDeepResearch}
                        defaultValue="Why did enterprise retention fall in Q2?"
                        showSuggestions={false}
                    />
                </MemoryRouter>
            </Provider>,
        );

        await user.click(screen.getByRole('button', { name: 'Deep research' }));

        expect(
            screen.getByRole('region', { name: 'Deep research settings' }),
        ).toBeInTheDocument();
        expect(screen.getAllByText('Beta')).toHaveLength(2);
        expect(
            screen.queryByRole('button', { name: 'Send message' }),
        ).not.toBeInTheDocument();

        await user.click(screen.getByText('High'));
        await user.click(
            screen.getByRole('button', { name: 'Start research' }),
        );

        expect(onStartDeepResearch).toHaveBeenCalledWith({
            question: 'Why did enterprise retention fall in Q2?',
            depth: 'deep',
        });
        expect(onSubmit).not.toHaveBeenCalled();
    });
});
