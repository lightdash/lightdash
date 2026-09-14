import { Button, MantineProvider, Modal } from '@mantine/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import MantineModal, { type MantineModalProps } from './index';
import { useMantineModalClose } from './useMantineModalClose';

// Stands in for a host's own control (a Cancel button in the header, a
// breadcrumb in the title) that has to close the modal it sits in.
const CloseFromInside = () => {
    const { requestClose } = useMantineModalClose();
    return <Button onClick={requestClose}>Leave</Button>;
};

const EscapeConsumingPortal = () => {
    const [opened, setOpened] = useState(true);

    return (
        <>
            <Button
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        setOpened(false);
                    }
                }}
            >
                Popup target
            </Button>
            {opened &&
                createPortal(
                    <div role="status">Portaled popup</div>,
                    document.body,
                )}
        </>
    );
};

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

    it('closes from a control inside the modal', async () => {
        const user = userEvent.setup();
        const { onClose } = renderModal({ children: <CloseFromInside /> });
        await user.click(screen.getByRole('button', { name: 'Leave' }));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('sends a control inside the modal through the unsaved changes confirmation', async () => {
        const user = userEvent.setup();
        const { onClose } = renderModal({
            confirmBeforeClose: true,
            children: <CloseFromInside />,
        });
        await user.click(screen.getByRole('button', { name: 'Leave' }));
        const confirmation = await screen.findByRole('dialog', {
            name: 'Unsaved changes',
        });
        expect(onClose).not.toHaveBeenCalled();
        await user.click(
            within(confirmation).getByRole('button', {
                name: 'Discard changes',
            }),
        );
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('keeps Escape on the topmost layer when a modal is nested in another', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        const onNestedClose = vi.fn();
        render(
            <MantineProvider env="test">
                <MantineModal opened title="Edit chart" onClose={onClose}>
                    <MantineModal
                        opened
                        title="Version history"
                        onClose={onNestedClose}
                    >
                        <Button>Restore</Button>
                    </MantineModal>
                </MantineModal>
            </MantineProvider>,
        );

        // Mantine's focus trap keeps focus in the topmost modal; jsdom does
        // not move it on its own
        await user.click(screen.getByRole('button', { name: 'Restore' }));
        await user.keyboard('{Escape}');
        expect(onNestedClose).toHaveBeenCalledOnce();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('keeps Escape on a plain Mantine modal nested in it', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        const onNestedClose = vi.fn();
        render(
            <MantineProvider env="test">
                <MantineModal opened title="Edit chart" onClose={onClose}>
                    <Modal
                        opened
                        title="Scheduled deliveries"
                        onClose={onNestedClose}
                    >
                        nested
                    </Modal>
                </MantineModal>
            </MantineProvider>,
        );

        await user.keyboard('{Escape}');
        expect(onNestedClose).toHaveBeenCalledOnce();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('lets a child consume Escape before closing the modal', async () => {
        const user = userEvent.setup();
        const { onClose } = renderModal({
            children: <EscapeConsumingPortal />,
        });

        expect(screen.getByRole('status')).toHaveTextContent('Portaled popup');
        await user.click(screen.getByRole('button', { name: 'Popup target' }));
        await user.keyboard('{Escape}');

        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('honors an explicit Escape override for an alert dialog', async () => {
        const user = userEvent.setup();
        const { onClose } = renderModal({
            role: 'alertdialog',
            modalRootProps: { closeOnEscape: true },
        });

        await user.keyboard('{Escape}');

        expect(onClose).toHaveBeenCalledOnce();
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
