import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import DesignModeButton from './DesignModeButton';

describe('DesignModeButton', () => {
    it('toggles Design Mode and shows when it is on', () => {
        const onClick = vi.fn();
        renderWithProviders(
            <DesignModeButton active screenshotAvailable onClick={onClick} />,
        );
        const button = screen.getByRole('button', { name: 'Design Mode' });
        expect(button).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(button);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('not offered when the app cannot take its own screenshot', async () => {
        const onClick = vi.fn();
        renderWithProviders(
            <DesignModeButton
                active={false}
                screenshotAvailable={false}
                onClick={onClick}
            />,
        );
        const button = screen.getByRole('button', { name: 'Design Mode' });
        expect(button).toHaveAttribute('aria-disabled', 'true');
        fireEvent.click(button);
        expect(onClick).not.toHaveBeenCalled();

        await userEvent.hover(button);
        expect(
            await screen.findByText(
                'This app needs updating to use Design Mode',
            ),
        ).toBeInTheDocument();
    });
});
