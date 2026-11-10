import { MantineProvider } from '@mantine/core';
import { composeStories } from '@storybook/react-vite';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as stories from './08-SetupGuide.stories';

const { Fresh, MostlyDone } = composeStories(stories);

describe('homepage setup guide stories', () => {
    it('lets users skip and restore optional steps in the fresh guide', async () => {
        render(
            <MantineProvider>
                <Fresh />
            </MantineProvider>,
        );
        await userEvent.click(
            await screen.findByRole('button', { name: 'Skip Connect Slack' }),
        );
        expect(screen.getByText('Skipped')).toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('button', { name: 'Add back Connect Slack' }),
        );
        expect(screen.queryByText('Skipped')).not.toBeInTheDocument();
    });

    it('shows readiness evidence alongside skipped steps', async () => {
        render(
            <MantineProvider>
                <MostlyDone />
            </MantineProvider>,
        );
        expect(await screen.findAllByText('Skipped')).toHaveLength(2);
    });
});
