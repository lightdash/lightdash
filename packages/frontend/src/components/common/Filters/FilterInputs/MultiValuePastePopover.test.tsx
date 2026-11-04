import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import MultiValuePastePopover from './MultiValuePastePopover';

describe('MultiValuePastePopover', () => {
    it('closes on Escape while focus stays in its input', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        renderWithProviders(
            <MultiValuePastePopover
                opened
                onClose={onClose}
                onMultiValue={() => {}}
                onSingleValue={() => {}}
            >
                <input aria-label="Values" />
            </MultiValuePastePopover>,
        );

        await user.click(screen.getByRole('textbox', { name: 'Values' }));
        await user.keyboard('{Escape}');

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on a press outside', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        renderWithProviders(
            <MultiValuePastePopover
                opened
                onClose={onClose}
                onMultiValue={() => {}}
                onSingleValue={() => {}}
            >
                <input aria-label="Values" />
            </MultiValuePastePopover>,
        );

        await user.click(document.body);

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does nothing on Escape while closed', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        renderWithProviders(
            <MultiValuePastePopover
                opened={false}
                onClose={onClose}
                onMultiValue={() => {}}
                onSingleValue={() => {}}
            >
                <input aria-label="Values" />
            </MultiValuePastePopover>,
        );

        await user.click(screen.getByRole('textbox', { name: 'Values' }));
        await user.keyboard('{Escape}');

        expect(onClose).not.toHaveBeenCalled();
    });
});
