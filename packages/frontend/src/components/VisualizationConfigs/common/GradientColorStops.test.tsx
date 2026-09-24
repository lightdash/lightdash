import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import GradientColorStops from './GradientColorStops';

const renderStops = (colors: string[]) => {
    const handlers = {
        onColorChange: vi.fn(),
        onAdd: vi.fn(),
        onRemove: vi.fn(),
    };
    renderWithProviders(
        <GradientColorStops colors={colors} swatches={[]} {...handlers} />,
    );
    return handlers;
};

describe('GradientColorStops', () => {
    it('labels the ends and never offers to remove them', async () => {
        const user = userEvent.setup();
        const { onAdd } = renderStops(['#000000', '#ffffff']);

        expect(screen.getByText('Low')).toBeInTheDocument();
        expect(screen.getByText('High')).toBeInTheDocument();
        for (const stop of screen.getAllByRole('button', {
            name: 'Select color',
        })) {
            await user.hover(stop);
            expect(
                screen.queryByRole('button', { name: 'Remove colour' }),
            ).toBeNull();
        }
        await user.click(screen.getByRole('button', { name: 'Add colour' }));
        expect(onAdd).toHaveBeenCalled();
    });

    it('removes a middle stop by index and caps the stops at five', async () => {
        const user = userEvent.setup();
        const { onRemove } = renderStops([
            '#000000',
            '#111111',
            '#222222',
            '#333333',
            '#ffffff',
        ]);

        expect(screen.queryByRole('button', { name: 'Add colour' })).toBeNull();
        await user.hover(
            screen.getAllByRole('button', { name: 'Select color' })[3],
        );
        await user.click(screen.getByRole('button', { name: 'Remove colour' }));
        expect(onRemove).toHaveBeenCalledWith(3);
    });
});
