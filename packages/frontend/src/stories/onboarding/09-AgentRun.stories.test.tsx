import { MantineProvider } from '@mantine/core';
import { composeStories } from '@storybook/react-vite';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
            await screen.findByRole('heading', {
                name: 'Building your project',
            }),
        ).toBeInTheDocument();
        expect(
            within(screen.getByRole('listitem', { current: 'step' })).getByText(
                'Build semantic layer',
            ),
        ).toBeInTheDocument();
        expect(screen.getByText('Wrote the orders model')).toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('button', { name: 'More setup options' }),
        );
        expect(
            await screen.findByRole('menuitem', { name: 'Cancel setup' }),
        ).toBeInTheDocument();
    });

    it('renders the completed run with handoff file and dashboard action', async () => {
        render(
            <MantineProvider>
                <Completed />
            </MantineProvider>,
        );
        expect(
            await screen.findByRole('link', { name: 'Open starter dashboard' }),
        ).toHaveAttribute('href', expect.stringContaining('/dashboards'));
        await userEvent.click(
            screen.getByRole('button', { name: 'More setup options' }),
        );
        const viewCode = await screen.findByRole('menuitem', {
            name: 'View code',
        });
        expect(
            screen.queryByRole('menuitem', { name: 'Cancel setup' }),
        ).not.toBeInTheDocument();
        await userEvent.click(viewCode);
        expect(await screen.findByText('handoff.md')).toBeInTheDocument();
    });
});
