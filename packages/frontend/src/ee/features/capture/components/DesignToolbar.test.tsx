import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import DesignToolbar from './DesignToolbar';

const setup = (holding: boolean, micOn = false) => {
    const onMicChange = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(
        <DesignToolbar
            ref={null}
            holding={holding}
            micOn={micOn}
            onMicChange={onMicChange}
            onClose={onClose}
        />,
    );
    return { onMicChange, onClose };
};

describe('DesignToolbar', () => {
    it('shows the one tool and how to use it', () => {
        setup(false);
        expect(screen.getByText('Mark')).toBeInTheDocument();
        expect(screen.getByText('Hold ⌥')).toBeInTheDocument();
        expect(
            screen.getByText('Click to pick, drag to draw'),
        ).toBeInTheDocument();
        expect(screen.queryByText('Hold ⌃')).toBeNull();
    });

    it('shows when Option is held', () => {
        setup(true);
        expect(
            screen.getByText('Mark').closest('[data-active]'),
        ).toHaveAttribute('data-active', 'true');
    });

    it('the mic button toggles the mic', () => {
        const { onMicChange } = setup(false, false);
        const mic = screen.getByRole('button', { name: 'Mic' });
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
