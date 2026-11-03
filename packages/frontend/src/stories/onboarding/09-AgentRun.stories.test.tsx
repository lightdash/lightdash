import { MantineProvider } from '@mantine/core';
import { composeStories } from '@storybook/react-vite';
import { render, screen } from '@testing-library/react';
import * as stories from './09-AgentRun.stories';

const { Running, Completed } = composeStories(stories);

describe('agent onboarding run stories', () => {
    it('renders the real running page with current stage and activity', async () => {
        render(
            <MantineProvider>
                <Running />
            </MantineProvider>,
        );
        expect(
            await screen.findByText('Building the semantic layer'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Cancel setup' }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'Defining revenue, order count and repeat customers',
            ),
        ).toBeInTheDocument();
    });

    it('renders the completed run with handoff file and dashboard action', async () => {
        render(
            <MantineProvider>
                <Completed />
            </MantineProvider>,
        );
        expect(
            await screen.findByRole('link', { name: 'View dashboard' }),
        ).toHaveAttribute('href', expect.stringContaining('/dashboards'));
        expect(screen.getByText('handoff.md')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Cancel setup' }),
        ).not.toBeInTheDocument();
    });
});
