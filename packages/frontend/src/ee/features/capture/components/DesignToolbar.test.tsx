import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import DesignToolbar from './DesignToolbar';

const setup = (holding: boolean, micOn = false, talking = false) => {
    const onMicChange = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(
        <DesignToolbar
            ref={null}
            holding={holding}
            talking={talking}
            micOn={micOn}
            onMicChange={onMicChange}
            onClose={onClose}
        />,
    );
    return { onMicChange, onClose };
};

const chip = () => document.querySelector('[data-active]')!;

describe('DesignToolbar', () => {
    it('at rest, says which key to hold', () => {
        setup(false);
        expect(chip()).toHaveTextContent('Hold⌥to activate');
        expect(chip()).toHaveAttribute('data-active', 'false');
        expect(screen.queryByText('Mark')).toBeNull();
    });

    it('with Option held, shows what a click and a drag do', () => {
        setup(true);
        expect(chip()).toHaveAttribute('data-active', 'true');
        expect(chip()).toHaveAttribute('data-recording', 'false');
        expect(chip()).toHaveTextContent('MarkAnnotate');
    });

    it('while recording, keeps the hints and shows it is recording', () => {
        setup(true, true, true);
        expect(chip()).toHaveAttribute('data-recording', 'true');
        expect(chip()).toHaveTextContent('MarkAnnotate');
    });

    it('the voice button toggles the mic', () => {
        const { onMicChange } = setup(false, false);
        const mic = screen.getByRole('button', { name: 'Voice' });
        expect(mic).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(mic);
        expect(onMicChange).toHaveBeenCalledWith(true);
    });

    it('the close button leaves Design Mode', () => {
        const { onClose } = setup(false);
        fireEvent.click(
            screen.getByRole('button', { name: 'Leave Design Mode' }),
        );
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
