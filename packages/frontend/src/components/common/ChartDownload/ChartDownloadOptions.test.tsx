import { Button, Popover } from '@mantine/core';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import ChartDownloadOptions from './ChartDownloadOptions';

const PopoverHarness = () => (
    <Popover closeOnClickOutside position="bottom-end">
        <Popover.Target>
            <Button>Open download options</Button>
        </Popover.Target>

        <Popover.Dropdown>
            <ChartDownloadOptions getChartInstance={vi.fn()} />
        </Popover.Dropdown>
    </Popover>
);

describe('ChartDownloadOptions', () => {
    it('applies a clicked format selection without closing the parent popover', async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 });
        const originalScrollIntoView =
            window.HTMLElement.prototype.scrollIntoView;
        window.HTMLElement.prototype.scrollIntoView = vi.fn();

        try {
            renderWithProviders(<PopoverHarness />);

            await user.click(
                screen.getByRole('button', { name: 'Open download options' }),
            );

            const popover = await screen.findByRole('dialog');
            expect(within(popover).getByText('Options')).toBeInTheDocument();

            await user.click(screen.getByRole('textbox'));

            const listbox = within(popover).getByRole('listbox', {
                hidden: true,
            });
            expect(listbox).toBeInTheDocument();

            fireEvent.click(
                within(listbox).getByRole('option', {
                    name: 'SVG',
                    hidden: true,
                }),
            );

            await waitFor(() => {
                expect(screen.getByRole('dialog')).toBeInTheDocument();
                expect(screen.getByRole('textbox')).toHaveValue('SVG');
            });
        } finally {
            window.HTMLElement.prototype.scrollIntoView =
                originalScrollIntoView;
        }
    });
});
