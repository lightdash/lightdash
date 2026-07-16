import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { DeepResearchModeControl } from './DeepResearchModeControl';

const renderControl = (onStart = vi.fn().mockResolvedValue(undefined)) => {
    renderWithProviders(
        <DeepResearchModeControl
            question="Why did enterprise retention fall in Q2?"
            projectUuid="project-1"
            agentUuid="agent-1"
            onStart={onStart}
            preflightRequest={0}
        />,
    );
    return onStart;
};

describe('DeepResearchModeControl', () => {
    it('keeps Ask as the unchanged default mode', () => {
        const onStart = renderControl();

        expect(
            screen.getByRole('button', { name: 'Deep research' }),
        ).toHaveAttribute('aria-pressed', 'false');

        expect(screen.queryByText('Research depth')).not.toBeInTheDocument();
        expect(onStart).not.toHaveBeenCalled();
    });

    it('starts Deep Research from the composer preflight', async () => {
        const user = userEvent.setup();
        const onStart = renderControl();

        await user.click(screen.getByRole('button', { name: 'Deep research' }));

        expect(await screen.findByText('Research depth')).toBeInTheDocument();
        expect(screen.getByText('Project data')).toBeInTheDocument();
        expect(screen.getByText('Public web')).toBeInTheDocument();
        expect(
            screen.getByText(/Connected AI Agent sources are not available/),
        ).toBeInTheDocument();

        await user.click(screen.getByText('Quick'));
        expect(screen.getByText('Up to 15 minutes')).toBeInTheDocument();
        expect(screen.getByText('Up to 10 queries')).toBeInTheDocument();

        await user.click(
            screen.getByRole('button', { name: 'Start research' }),
        );

        expect(onStart).toHaveBeenCalledWith('quick');
    });
});
