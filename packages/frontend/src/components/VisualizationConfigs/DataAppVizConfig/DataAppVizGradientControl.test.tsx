import { type DataAppVizColorGradient } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppVizGradientControl from './DataAppVizGradientControl';

const declaredDefault = {
    enabled: false,
    start: '#111111',
    end: '#eeeeee',
    min: 'auto',
    max: 'auto',
} as const;

describe('DataAppVizGradientControl', () => {
    it('enables a fixed-hex gradient and edits its bounds', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const StatefulControl = () => {
            const [value, setValue] = useState<DataAppVizColorGradient>({
                ...declaredDefault,
            });
            return (
                <DataAppVizGradientControl
                    value={value}
                    colorPalette={['#222222', '#dddddd']}
                    onChange={(patch) => {
                        onChange(patch);
                        setValue((current) => ({ ...current, ...patch }));
                    }}
                />
            );
        };
        renderWithProviders(<StatefulControl />);

        await user.click(screen.getByRole('switch', { name: 'Use gradient' }));
        expect(onChange).toHaveBeenCalledWith({ enabled: true });

        await user.click(
            screen.getByRole('button', { name: 'Gradient start' }),
        );
        await user.click(screen.getByRole('button', { name: '#222222' }));
        await vi.waitFor(() =>
            expect(onChange).toHaveBeenCalledWith({ start: '#222222' }),
        );

        await user.click(screen.getByRole('combobox', { name: 'Minimum' }));
        await user.click(screen.getByRole('option', { name: 'Custom' }));
        expect(onChange).toHaveBeenCalledWith({ min: 0 });
        expect(
            screen.getByRole('textbox', { name: 'Minimum value' }),
        ).toHaveValue('0');
    });

    it('explains reversed custom bounds without losing the chosen endpoints', () => {
        renderWithProviders(
            <DataAppVizGradientControl
                value={{ ...declaredDefault, enabled: true, min: 10, max: 2 }}
                colorPalette={['#222222']}
                onChange={vi.fn()}
            />,
        );

        expect(screen.getByRole('alert')).toHaveTextContent(
            'Minimum must be less than or equal to maximum.',
        );
        expect(
            screen.getByRole('button', { name: 'Gradient start' }),
        ).toBeVisible();
        expect(
            screen.getByRole('button', { name: 'Gradient end' }),
        ).toBeVisible();
    });
});
