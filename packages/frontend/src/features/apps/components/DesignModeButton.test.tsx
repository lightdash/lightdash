import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import DesignModeButton from './DesignModeButton';

vi.mock('../../../ee/features/capture/onboarding', () => ({
    DESIGN_MODE_BUTTON_TOUR_ID: 'design-mode-button',
    DesignModeTour: () => null,
}));

describe('DesignModeButton', () => {
    it('toggles Design Mode and shows when it is on', () => {
        const onClick = vi.fn();
        renderWithProviders(
            <DesignModeButton
                active
                support="ready"
                onClick={onClick}
                surface="app"
            />,
        );
        const button = screen.getByRole('button', { name: 'Design Mode' });
        expect(button).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(button);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('not offered when the app cannot be pictured or picked from', async () => {
        const onClick = vi.fn();
        renderWithProviders(
            <DesignModeButton
                active={false}
                support="needs-update"
                onClick={onClick}
                surface="app"
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

    it('while the app is still loading, waits without saying it needs updating', async () => {
        const onClick = vi.fn();
        renderWithProviders(
            <DesignModeButton
                active={false}
                support="checking"
                onClick={onClick}
                surface="app"
            />,
        );
        const button = screen.getByRole('button', { name: 'Design Mode' });
        expect(button).toHaveAttribute('aria-disabled', 'true');
        fireEvent.click(button);
        expect(onClick).not.toHaveBeenCalled();
        await userEvent.hover(button);
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'Design Mode',
        );
        expect(
            screen.queryByText('This app needs updating to use Design Mode'),
        ).toBeNull();
    });
});
