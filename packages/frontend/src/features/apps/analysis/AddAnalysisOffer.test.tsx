import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AddAnalysisOffer from './AddAnalysisOffer';

const renderOffer = (
    props: Partial<React.ComponentProps<typeof AddAnalysisOffer>> = {},
) => {
    const handlers = {
        onAddAnalysis: vi.fn(),
        onUpgradeApp: vi.fn(),
        onDismiss: vi.fn(),
    };
    render(
        <MantineProvider>
            <AddAnalysisOffer
                sdkNeedsUpgrade={false}
                busy={false}
                {...handlers}
                {...props}
            />
        </MantineProvider>,
    );
    return handlers;
};

describe('AddAnalysisOffer', () => {
    it('submits the canned prompt on a current SDK', async () => {
        const handlers = renderOffer();
        await userEvent.click(
            screen.getByRole('button', { name: 'Add AI analysis' }),
        );
        expect(handlers.onAddAnalysis).toHaveBeenCalledTimes(1);
        expect(handlers.onUpgradeApp).not.toHaveBeenCalled();
    });

    it('routes through the app upgrade on an older SDK', async () => {
        const handlers = renderOffer({ sdkNeedsUpgrade: true });
        await userEvent.click(
            screen.getByRole('button', { name: 'Upgrade app' }),
        );
        expect(handlers.onUpgradeApp).toHaveBeenCalledTimes(1);
        expect(handlers.onAddAnalysis).not.toHaveBeenCalled();
        expect(
            screen.queryByRole('button', { name: 'Add AI analysis' }),
        ).not.toBeInTheDocument();
    });

    it('dismisses via the close button', async () => {
        const handlers = renderOffer();
        await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(handlers.onDismiss).toHaveBeenCalledTimes(1);
    });

    it('disables the action while a submit is in flight', () => {
        renderOffer({ busy: true });
        expect(
            screen.getByRole('button', { name: 'Add AI analysis' }),
        ).toBeDisabled();
    });
});
