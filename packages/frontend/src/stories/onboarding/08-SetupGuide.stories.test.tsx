import { MantineProvider } from '@mantine/core';
import { composeStories } from '@storybook/react-vite';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as stories from './08-SetupGuide.stories';

const { Fresh, Building, MostlyDone } = composeStories(stories);

describe('homepage setup guide stories', () => {
    it('lets users skip and restore optional steps in the fresh guide', async () => {
        render(
            <MantineProvider>
                <Fresh />
            </MantineProvider>,
        );
        await userEvent.click(
            await screen.findByRole('button', {
                name: 'More options for Connect Slack',
            }),
        );
        await userEvent.click(await screen.findByText('Skip for now'));
        expect(screen.getByText('Skipped')).toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('button', {
                name: 'More options for Connect Slack',
            }),
        );
        await userEvent.click(await screen.findByText('Add back to the list'));
        expect(screen.queryByText('Skipped')).not.toBeInTheDocument();
    });

    it('uses the real expandable progress component while building', async () => {
        render(
            <MantineProvider>
                <Building />
            </MantineProvider>,
        );
        await userEvent.click(
            await screen.findByRole('button', { name: 'Watch' }),
        );
        expect(
            await screen.findByRole('list', { name: 'Setup stages' }),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Building the semantic layer'),
        ).toBeInTheDocument();
    });

    it('shows readiness evidence alongside skipped steps', async () => {
        render(
            <MantineProvider>
                <MostlyDone />
            </MantineProvider>,
        );
        expect(await screen.findAllByText('Skipped')).toHaveLength(2);
        await userEvent.click(screen.getByText(/of \d+ done/));
        expect(
            screen.getByText('3 models ready to explore'),
        ).toBeInTheDocument();
        expect(screen.getByText('Coffee overview')).toBeInTheDocument();
    });
});
