import { Select } from '@mantine/core';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import MantineModal from '../../../../components/common/MantineModal';
import { renderWithProviders } from '../../../../testing/testUtils';
import { CanvasViewport } from './CanvasViewport';

const Fixture = () => {
    const [dialogOpened, setDialogOpened] = useState(false);
    return (
        <CanvasViewport
            navigation={
                <button onClick={() => setDialogOpened(true)}>
                    Open nested dialog
                </button>
            }
        >
            <input aria-label="Draft" defaultValue="Unsaved tree" />
            <Select label="Period" data={['Month', 'Year']} />
            <MantineModal
                opened={dialogOpened}
                onClose={() => setDialogOpened(false)}
                title="Nested dialog"
            >
                Details
            </MantineModal>
        </CanvasViewport>
    );
};

describe('expanded canvas', () => {
    it('preserves the editor, restores scrolling, and leaves nested Escape handling to its dialog', async () => {
        const user = userEvent.setup();
        const originalOverflow = document.body.style.overflow;
        renderWithProviders(<Fixture />);
        const draft = screen.getByLabelText('Draft');
        await user.click(screen.getByRole('button', { name: 'Expand canvas' }));
        expect(
            screen.getByRole('dialog', { name: 'Metrics canvas' }),
        ).toBeVisible();
        expect(document.body.style.overflow).toBe('hidden');
        expect(screen.getByLabelText('Draft')).toBe(draft);
        expect(draft).toHaveValue('Unsaved tree');

        await user.click(screen.getByRole('combobox', { name: 'Period' }));
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        expect(
            screen.getByRole('dialog', { name: 'Metrics canvas' }),
        ).toBeVisible();

        await user.click(
            screen.getByRole('button', { name: 'Open nested dialog' }),
        );
        await user.keyboard('{Escape}');
        expect(
            screen.queryByRole('dialog', { name: 'Nested dialog' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('dialog', { name: 'Metrics canvas' }),
        ).toBeVisible();
        screen.getByRole('button', { name: 'Exit expanded canvas' }).focus();
        await user.keyboard('{Escape}');
        expect(
            screen.queryByRole('dialog', { name: 'Metrics canvas' }),
        ).not.toBeInTheDocument();
        expect(document.body.style.overflow).toBe(originalOverflow);
        expect(screen.getByLabelText('Draft')).toBe(draft);
        expect(draft).toHaveValue('Unsaved tree');
    });
});
