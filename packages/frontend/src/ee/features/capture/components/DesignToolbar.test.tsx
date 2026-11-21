import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { type DesignTool } from '../types';
import DesignToolbar from './DesignToolbar';

const setup = (tool: DesignTool | null, micOn = false) => {
    const onMicChange = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(
        <DesignToolbar
            ref={null}
            tool={tool}
            micOn={micOn}
            onMicChange={onMicChange}
            onClose={onClose}
        />,
    );
    return { onMicChange, onClose };
};

describe('DesignToolbar', () => {
    it('shows the hold hint for each tool', () => {
        setup(null);
        expect(screen.getByText('Stylus')).toBeInTheDocument();
        expect(screen.getByText('Hold ⌥')).toBeInTheDocument();
        expect(screen.getByText('Cursor')).toBeInTheDocument();
        expect(screen.getByText('Hold ⌃')).toBeInTheDocument();
    });

    it('marks the tool being held', () => {
        setup('cursor');
        expect(document.querySelector('[data-tool="cursor"]')).toHaveAttribute(
            'data-active',
            'true',
        );
        expect(document.querySelector('[data-tool="stylus"]')).toHaveAttribute(
            'data-active',
            'false',
        );
    });

    it('the mic button toggles the mic', () => {
        const { onMicChange } = setup(null, false);
        const mic = screen.getByRole('button', { name: 'Mic' });
        expect(mic).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(mic);
        expect(onMicChange).toHaveBeenCalledWith(true);
    });

    it('the close button leaves Design Mode', () => {
        const { onClose } = setup(null);
        fireEvent.click(
            screen.getByRole('button', { name: 'Leave Design Mode' }),
        );
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
