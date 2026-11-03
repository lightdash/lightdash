import { MantineProvider } from '@mantine/core';
import { composeStories } from '@storybook/react-vite';
import { fireEvent, render, screen } from '@testing-library/react';
import * as stories from './08-SetupGuide.stories';

const { Fresh, Building, MostlyDone } = composeStories(stories);

describe('homepage setup guide stories', () => {
    it('lets users skip and restore optional steps in the fresh guide', async () => {
        render(
            <MantineProvider>
                <Fresh />
            </MantineProvider>,
        );
        fireEvent.click(
            await screen.findByRole('button', { name: 'Skip Connect Slack' }),
        );
        expect(screen.getByText('Skipped')).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Restore Connect Slack' }),
        );
        expect(screen.queryByText('Skipped')).not.toBeInTheDocument();
    });

    it('uses the real expandable progress component while building', async () => {
        render(
            <MantineProvider>
                <Building />
            </MantineProvider>,
        );
        fireEvent.click(
            await screen.findByRole('button', { name: 'Show progress' }),
        );
        expect(
            screen.getByRole('list', { name: 'Setup stages' }),
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
        expect(
            await screen.findByText('3 models ready to explore'),
        ).toBeInTheDocument();
        expect(screen.getAllByText('Skipped')).toHaveLength(2);
        expect(screen.getByText('Coffee overview')).toBeInTheDocument();
    });
});
