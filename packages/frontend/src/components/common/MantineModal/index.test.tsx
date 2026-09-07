import { MantineProvider } from '@mantine/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MantineModal, { type MantineModalProps } from './index';

const renderModal = (props: Partial<MantineModalProps> = {}) => {
    const onClose = vi.fn();
    render(
        <MantineProvider env="test">
            <MantineModal
                opened
                title="Share dashboard"
                onClose={onClose}
                {...props}
            />
        </MantineProvider>,
    );
    return { onClose };
};

describe('MantineModal accessibility', () => {
    it('names the dialog from its title and labels the close button', async () => {
        const user = userEvent.setup();
        const { onClose } = renderModal();
        const dialog = screen.getByRole('dialog', { name: 'Share dashboard' });
        await user.click(within(dialog).getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('allows Escape to dismiss an ordinary dialog', async () => {
        const user = userEvent.setup();
        const { onClose } = renderModal();
        await user.keyboard('{Escape}');
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('keeps a destructive confirmation open on Escape', async () => {
        const user = userEvent.setup();
        const onConfirm = vi.fn();
        const { onClose } = renderModal({
            variant: 'delete',
            title: 'Remove access',
            onConfirm,
        });
        const dialog = screen.getByRole('dialog', {
            name: 'Remove access',
        });
        await user.keyboard('{Escape}');
        expect(onClose).not.toHaveBeenCalled();
        expect(onConfirm).not.toHaveBeenCalled();
        await user.click(
            within(dialog).getByRole('button', { name: 'Delete' }),
        );
        expect(onConfirm).toHaveBeenCalledOnce();
    });

    it('names the unsaved changes confirmation and preserves edits on cancellation', async () => {
        const user = userEvent.setup();
        const { onClose } = renderModal({ confirmBeforeClose: true });
        await user.keyboard('{Escape}');
        const confirmation = await screen.findByRole('dialog', {
            name: 'Unsaved changes',
        });
        expect(
            within(confirmation).getByRole('button', { name: 'Close' }),
        ).toBeVisible();
        await user.click(
            within(confirmation).getByRole('button', { name: 'Keep editing' }),
        );
        expect(onClose).not.toHaveBeenCalled();
        expect(
            screen.getByRole('dialog', { name: 'Share dashboard' }),
        ).toBeVisible();
    });

    it('discards edits only after explicit confirmation', async () => {
        const user = userEvent.setup();
        const { onClose } = renderModal({ confirmBeforeClose: true });
        await user.keyboard('{Escape}');
        const confirmation = await screen.findByRole('dialog', {
            name: 'Unsaved changes',
        });
        await user.click(
            within(confirmation).getByRole('button', {
                name: 'Discard changes',
            }),
        );
        expect(onClose).toHaveBeenCalledOnce();
    });
});
