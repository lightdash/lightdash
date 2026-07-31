import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { store } from '../../store';
import { AgentChatInput } from './AgentChatInput';

const { useHasActiveDeepResearchRunMock } = vi.hoisted(() => ({
    useHasActiveDeepResearchRunMock: vi.fn(() => false),
}));

vi.mock('../../hooks/useDeepResearch', () => ({
    useHasActiveDeepResearchRun: useHasActiveDeepResearchRunMock,
}));

const renderInput = ({
    onStartDeepResearch = vi.fn().mockResolvedValue(undefined),
    onSubmit = vi.fn(),
    disabled = false,
    threadUuid = 'thread-1',
}: {
    onStartDeepResearch?:
        | ((args: { question: string }) => Promise<void>)
        | null;
    onSubmit?: (args: { message: string; toolHints: string[] }) => void;
    disabled?: boolean;
    threadUuid?: string | null;
} = {}) => {
    renderWithProviders(
        <Provider store={store}>
            <MemoryRouter>
                <AgentChatInput
                    onSubmit={onSubmit}
                    onStartDeepResearch={onStartDeepResearch ?? undefined}
                    disabled={disabled}
                    projectUuid="project-1"
                    agentUuid="agent-1"
                    threadUuid={threadUuid ?? undefined}
                    defaultValue="Why did enterprise retention fall?"
                    showSuggestions={false}
                />
            </MemoryRouter>
        </Provider>,
    );
    return { onStartDeepResearch, onSubmit };
};

describe('AgentChatInput Deep Research mode', () => {
    beforeEach(() => {
        useHasActiveDeepResearchRunMock.mockReturnValue(false);
    });

    it('renders the toggle outside the composer in an existing conversation', () => {
        renderInput();

        expect(
            screen
                .getByRole('button', { name: 'Turn on Deep research' })
                .closest('[data-accent]'),
        ).toBeNull();
    });

    it('keeps the toggle inside a clean composer', () => {
        renderInput({ threadUuid: null });

        expect(
            screen
                .getByRole('button', { name: 'Turn on Deep research' })
                .closest('[data-accent]'),
        ).not.toBeNull();
    });

    it('starts research with one click and resets the toggle after submission', async () => {
        const user = userEvent.setup();
        const { onStartDeepResearch, onSubmit } = renderInput();

        await user.click(
            screen.getByRole('button', { name: 'Turn on Deep research' }),
        );
        expect(
            screen.getByRole('button', { name: 'Turn off Deep research' }),
        ).toHaveAttribute('aria-pressed', 'true');

        await user.click(
            screen.getByRole('button', { name: 'Start research' }),
        );

        expect(onStartDeepResearch).toHaveBeenCalledWith({
            question: 'Why did enterprise retention fall?',
        });
        expect(onSubmit).not.toHaveBeenCalled();
        expect(
            screen.getByRole('button', { name: 'Turn on Deep research' }),
        ).toHaveAttribute('aria-pressed', 'false');
    });

    it('keeps the prompt and enabled mode when starting fails', async () => {
        const user = userEvent.setup();
        renderInput({
            onStartDeepResearch: vi
                .fn()
                .mockRejectedValue(new Error('Could not start')),
        });

        await user.click(
            screen.getByRole('button', { name: 'Turn on Deep research' }),
        );
        await user.click(
            screen.getByRole('button', { name: 'Start research' }),
        );

        expect(
            screen.getByRole('button', { name: 'Turn off Deep research' }),
        ).toHaveAttribute('aria-pressed', 'true');
        expect(
            screen.getByText('Why did enterprise retention fall?'),
        ).toBeInTheDocument();
    });

    it('hides the toggle when Deep Research is unavailable', () => {
        renderInput({ onStartDeepResearch: null });

        expect(
            screen.queryByRole('button', { name: 'Turn on Deep research' }),
        ).not.toBeInTheDocument();
    });

    it('does not start research while the composer is disabled', async () => {
        const user = userEvent.setup();
        const onStartDeepResearch = vi.fn().mockResolvedValue(undefined);
        renderInput({ onStartDeepResearch, disabled: true });

        await user.click(
            screen.getByRole('button', { name: 'Turn on Deep research' }),
        );

        expect(
            screen.getByRole('button', { name: 'Start research' }),
        ).toBeDisabled();
        expect(onStartDeepResearch).not.toHaveBeenCalled();
    });

    it('keeps regular chat available while Deep research is active', async () => {
        const user = userEvent.setup();
        useHasActiveDeepResearchRunMock.mockReturnValue(true);
        const { onStartDeepResearch, onSubmit } = renderInput();

        expect(
            screen.getByRole('button', { name: 'Turn on Deep research' }),
        ).toBeDisabled();

        await user.click(screen.getByRole('button', { name: 'Send message' }));

        expect(onSubmit).toHaveBeenCalledWith({
            message: 'Why did enterprise retention fall?',
            toolHints: [],
        });
        expect(onStartDeepResearch).not.toHaveBeenCalled();
    });
});
